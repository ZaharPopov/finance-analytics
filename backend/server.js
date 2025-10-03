const express = require("express");
const { ApolloServer, gql } = require("apollo-server-express");
const { Pool } = require("pg");
require("dotenv").config();

// === НАСТРОЙКА БАЗЫ ДАННЫХ ===
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// === MOCK REDIS ДЛЯ ДЕМОНСТРАЦИИ ===
console.log("🔴 Используется Mock Redis для демонстрации кеширования");

const mockRedis = {
  data: new Map(),
  isConnected: true,

  async get(key) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return this.data.get(key);
  },

  async setEx(key, ttl, value) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.data.set(key, value);
    console.log("📦 Данные записаны в кеш (mock):", key);
  },

  async del(key) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.data.delete(key);
    console.log("🗑️ Кеш очищен (mock):", key);
  },

  async ping() {
    return "PONG";
  },

  isOpen: true,
};

const redisClient = mockRedis;

const withCache = async (key, ttlSeconds, fetchData) => {
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      console.log("📦 Данные из кеша (mock):", key);
      return JSON.parse(cached);
    }

    console.log("🔄 Запрос к базе:", key);
    const data = await fetchData();

    await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
    return data;
  } catch (error) {
    console.log("⚠️ Ошибка кеша, запрос к базе:", key);
    return await fetchData();
  }
};

// === GraphQL СХЕМА ===
const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    name: String
  }

  type Project {
    id: ID!
    name: String!
    budget: Float!
    created_at: String!
  }

  type Transaction {
    id: ID!
    amount: Float!
    category: String!
    description: String
    type: String!
    created_at: String!
    project_id: ID!
  }

  type Query {
    myProjects(userId: ID!): [Project!]!
    projectTransactions(projectId: ID!): [Transaction!]!
    userTransactions(userId: ID!): [Transaction!]!
  }

  type Mutation {
    createProject(name: String!, budget: Float!, userId: ID!): Project!
    createTransaction(projectId: ID!, amount: Float!, category: String!, description: String, type: String!): Transaction!
    login(email: String!, password: String!): User
    register(name: String!, email: String!, password: String!): User
    updateTransaction(id: ID!, amount: Float, category: String, description: String, type: String): Transaction!
    deleteTransaction(id: ID!): Boolean!
  }
`;

// === РЕЗОЛВЕРЫ ===
const resolvers = {
  Query: {
    myProjects: async (_, { userId }) => {
      return withCache(`projects:${userId}`, 300, async () => {
        const result = await pool.query("SELECT * FROM projects WHERE user_id = $1", [userId]);
        return result.rows;
      });
    },

    userTransactions: async (_, { userId }) => {
      return withCache(`transactions:user:${userId}`, 60, async () => {
        const result = await pool.query(
          `SELECT t.* FROM transactions t 
           JOIN projects p ON t.project_id = p.id 
           WHERE p.user_id = $1`,
          [userId]
        );
        return result.rows;
      });
    },

    projectTransactions: async (_, { projectId }) => {
      const result = await pool.query("SELECT * FROM transactions WHERE project_id = $1 ORDER BY created_at DESC", [projectId]);
      return result.rows;
    },
  },

  Mutation: {
    register: async (_, { name, email, password }) => {
      const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
      if (existingUser.rows[0]) {
        throw new Error("Пользователь с таким email уже существует");
      }
      if (password.length < 3) {
        throw new Error("Пароль должен быть не менее 3 символов");
      }
      const result = await pool.query("INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, email, name", [name, email, password]);

      return result.rows[0];
    },

    login: async (_, { email, password }) => {
      const result = await pool.query("SELECT id, email, name, password FROM users WHERE email = $1", [email]);

      if (!result.rows[0]) {
        throw new Error("Пользователь не найден");
      }

      const user = result.rows[0];

      if (user.password !== password) {
        throw new Error("Неверный пароль");
      }

      return { id: user.id, email: user.email, name: user.name };
    },

    createProject: async (_, { name, budget, userId }) => {
      const result = await pool.query("INSERT INTO projects (name, budget, user_id) VALUES ($1, $2, $3) RETURNING *", [name, budget, userId]);

      try {
        await redisClient.del(`projects:${userId}`);
        console.log("🗑️ Кеш проектов очищен");
      } catch (error) {
        // Игнорируем ошибки
      }

      return result.rows[0];
    },

    createTransaction: async (_, { projectId, amount, category, description, type }) => {
      const result = await pool.query(
        `INSERT INTO transactions 
         (project_id, amount, category, description, type) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [projectId, amount, category, description, type]
      );

      try {
        const projectResult = await pool.query("SELECT user_id FROM projects WHERE id = $1", [projectId]);
        if (projectResult.rows[0]) {
          await redisClient.del(`transactions:user:${projectResult.rows[0].user_id}`);
          console.log("🗑️ Кеш транзакций очищен");
        }
      } catch (error) {
        // Игнорируем ошибки
      }

      return result.rows[0];
    },

    updateTransaction: async (_, { id, amount, category, description, type }) => {
      console.log("Updating transaction:", { id, amount, category, description, type });
      const result = await pool.query(
        `UPDATE transactions 
         SET amount = COALESCE($2, amount),
             category = COALESCE($3, category),
             description = COALESCE($4, description),
             type = COALESCE($5, type)
         WHERE id = $1 RETURNING *`,
        [id, amount, category, description, type]
      );

      try {
        const transactionResult = await pool.query("SELECT project_id FROM transactions WHERE id = $1", [id]);
        if (transactionResult.rows[0]) {
          const projectResult = await pool.query("SELECT user_id FROM projects WHERE id = $1", [transactionResult.rows[0].project_id]);
          if (projectResult.rows[0]) {
            await redisClient.del(`transactions:user:${projectResult.rows[0].user_id}`);
            console.log("🗑️ Кеш транзакций очищен после обновления");
          }
        }
      } catch (error) {
        // Игнорируем ошибки
      }

      console.log("Update result:", result.rows[0]);
      return result.rows[0];
    },

    deleteTransaction: async (_, { id }) => {
      let userId = null;
      try {
        const transactionResult = await pool.query("SELECT project_id FROM transactions WHERE id = $1", [id]);
        if (transactionResult.rows[0]) {
          const projectResult = await pool.query("SELECT user_id FROM projects WHERE id = $1", [transactionResult.rows[0].project_id]);
          if (projectResult.rows[0]) {
            userId = projectResult.rows[0].user_id;
          }
        }
      } catch (error) {
        // Продолжаем даже если не нашли user_id
      }

      await pool.query("DELETE FROM transactions WHERE id = $1", [id]);

      if (userId) {
        try {
          await redisClient.del(`transactions:user:${userId}`);
          console.log("🗑️ Кеш транзакций очищен после удаления");
        } catch (error) {
          // Игнорируем ошибки
        }
      }

      return true;
    },
  },
};

// === ЗАПУСК СЕРВЕРА ===
async function startServer() {
  const app = express();
  const server = new ApolloServer({ typeDefs, resolvers });

  await server.start();
  server.applyMiddleware({ app });

  const PORT = process.env.SERVER_PORT || 4000;

  app.listen(PORT, () => {
    console.log(`🚀 Server ready at http://${process.env.SERVER_HOST}:${PORT}${server.graphqlPath}`);
  });
}

startServer();
