<script>
import { ref, computed, onMounted, watch } from "vue";
import { useQuery, useMutation } from "@vue/apollo-composable";
import gql from "graphql-tag";

// === GraphQL ЗАПРОСЫ ===
const REGISTER = gql`
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) {
      id
      email
      name
    }
  }
`;

const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      id
      email
      name
    }
  }
`;

const GET_MY_PROJECTS = gql`
  query MyProjects($userId: ID!) {
    myProjects(userId: $userId) {
      id
      name
      budget
    }
  }
`;

const GET_USER_TRANSACTIONS = gql`
  query UserTransactions($userId: ID!) {
    userTransactions(userId: $userId) {
      id
      amount
      category
      description
      type
      created_at
      project_id
    }
  }
`;

const GET_PROJECT_TRANSACTIONS = gql`
  query ProjectTransactions($projectId: ID!) {
    projectTransactions(projectId: $projectId) {
      id
      amount
      category
      description
      type
      created_at
      project_id
    }
  }
`;

const CREATE_PROJECT = gql`
  mutation CreateProject($name: String!, $budget: Float!, $userId: ID!) {
    createProject(name: $name, budget: $budget, userId: $userId) {
      id
      name
      budget
    }
  }
`;

const CREATE_TRANSACTION = gql`
  mutation CreateTransaction($projectId: ID!, $amount: Float!, $category: String!, $description: String, $type: String!) {
    createTransaction(projectId: $projectId, amount: $amount, category: $category, description: $description, type: $type) {
      id
      amount
      category
      type
    }
  }
`;

const UPDATE_TRANSACTION = gql`
  mutation UpdateTransaction($id: ID!, $amount: Float, $category: String, $description: String, $type: String) {
    updateTransaction(id: $id, amount: $amount, category: $category, description: $description, type: $type) {
      id
      amount
      category
      description
      type
      created_at
      project_id
    }
  }
`;

const DELETE_TRANSACTION = gql`
  mutation DeleteTransaction($id: ID!) {
    deleteTransaction(id: $id)
  }
`;

export default {
  setup() {
    // === СОСТОЯНИЕ ===
    const user = ref(null);
    const name = ref("");
    const email = ref("");
    const password = ref("");
    const newProjectName = ref("");
    const newProjectBudget = ref(0);
    const showRegister = ref(false);
    const selectedProject = ref(null);
    const showTransactionForm = ref(false);
    const transactionAmount = ref(0);
    const transactionCategory = ref("");
    const transactionDescription = ref("");
    const transactionType = ref("income");
    const editingTransaction = ref(null);
    const editAmount = ref(0);
    const editCategory = ref("");
    const editDescription = ref("");
    const editType = ref("income");
    const deleteConfirmation = ref({
      show: false,
      transactionId: null,
      transactionName: "",
    });

    // === GraphQL ЗАПРОСЫ И МУТАЦИИ===
    const { result: projectsResult, loading, refetch } = useQuery(GET_MY_PROJECTS, { userId: user.value?.id, enabled: false });
    const { result: allTransactionsResult, refetch: refetchAllTransactions } = useQuery(GET_USER_TRANSACTIONS, { userId: user.value?.id, enabled: false });
    const { result: transactionsResult, refetch: refetchTransactions } = useQuery(GET_PROJECT_TRANSACTIONS, { projectId: selectedProject.value?.id, enabled: false });
    const { mutate: loginMutation } = useMutation(LOGIN);
    const { mutate: registerMutation } = useMutation(REGISTER);
    const { mutate: createProjectMutation } = useMutation(CREATE_PROJECT);
    const { mutate: createTransactionMutation } = useMutation(CREATE_TRANSACTION);
    const { mutate: updateTransactionMutation } = useMutation(UPDATE_TRANSACTION);
    const { mutate: deleteTransactionMutation } = useMutation(DELETE_TRANSACTION);

    // === ВЫЧИСЛЯЕМЫЕ СВОЙСТВА ===
    const projects = computed(() => {
      return projectsResult.value?.myProjects || [];
    });

    const allTransactions = computed(() => {
      return allTransactionsResult.value?.userTransactions || [];
    });

    const transactions = computed(() => {
      const trans = transactionsResult.value?.projectTransactions || [];
      console.log("Транзакции проекта (все поля):", trans);
      if (trans.length > 0) {
        console.log("Поля первой транзакции:", Object.keys(trans[0]));
        console.log("project_id первой транзакции:", trans[0].project_id);
        console.log("Дата первой транзакции:", trans[0].created_at);
        console.log("Тип даты:", typeof trans[0].created_at);
      }
      return trans;
    });

    const projectsWithProgress = computed(() => {
      return projects.value.map((project) => {
        const projectTransactions = allTransactions.value.filter((t) => String(t.project_id) === String(project.id));

        console.log("Проект:", project.name, "ID:", project.id);
        console.log("Транзакции проекта:", projectTransactions);

        const income = projectTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + parseFloat(t.amount), 0);

        const expenses = projectTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + parseFloat(t.amount), 0);

        const balance = income - expenses;
        const progress = project.budget > 0 ? (balance / project.budget) * 100 : 0;

        console.log("Баланс:", balance, "Прогресс:", progress);

        return {
          ...project,
          current_balance: balance,
          progress_percent: Math.min(progress, 100),
          income,
          expenses,
        };
      });
    });

    // === ХУКИ ЖИЗНЕННОГО ЦИКЛА ===
    onMounted(() => {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        try {
          user.value = JSON.parse(savedUser);
          console.log("Автовход:", user.value.email);
        } catch {
          localStorage.removeItem("user");
        }
      }
    });

    watch(user, (newUser) => {
      if (newUser && newUser.id) {
        refetch({ userId: newUser.id });
        refetchAllTransactions({ userId: newUser.id });
      }
    });

    // === ФУНКЦИИ ПРОЕКТОВ ===
    const selectProject = (project) => {
      selectedProject.value = project;
      refetchTransactions({ projectId: project.id });
    };

    const backToProjects = () => {
      selectedProject.value = null;
    };

    const createProject = async () => {
      if (!newProjectName.value || !user.value) return;

      try {
        await createProjectMutation({
          name: newProjectName.value,
          budget: parseFloat(newProjectBudget.value) || 0,
          userId: user.value.id,
        });

        newProjectName.value = "";
        newProjectBudget.value = 0;
        refetch({ userId: user.value.id });
      } catch (error) {
        console.error("Error creating project:", error);
      }
    };

    // === ФУНКЦИИ АВТОРИЗАЦИИ ===

    const register = async () => {
      try {
        const result = await registerMutation({
          name: name.value,
          email: email.value,
          password: password.value,
        });
        user.value = result.data.register;
        localStorage.setItem("user", JSON.stringify(user.value));
        name.value = "";
        email.value = "";
        password.value = "";
        refetch({ userId: user.value.id });
      } catch (error) {}
    };

    const login = async () => {
      try {
        const result = await loginMutation({
          email: email.value,
          password: password.value,
        });
        user.value = result.data.login;
        localStorage.setItem("user", JSON.stringify(user.value));
        email.value = "";
        password.value = "";
        refetch({ userId: user.value.id });
        refetchAllTransactions({ userId: user.value.id });
      } catch (error) {}
    };

    const logout = () => {
      user.value = null;
      localStorage.removeItem("user");
    };

    // === ФУНКЦИИ ТРАНЗАКЦИЙ ===

    const createTransaction = async () => {
      if (!selectedProject.value) return;

      try {
        await createTransactionMutation({
          projectId: selectedProject.value.id,
          amount: parseFloat(transactionAmount.value),
          category: transactionCategory.value,
          description: transactionDescription.value,
          type: transactionType.value,
        });

        transactionAmount.value = 0;
        transactionCategory.value = "";
        transactionDescription.value = "";
        transactionType.value = "expense";
        showTransactionForm.value = false;

        await updateSelectedProjectStats();
      } catch (error) {
        console.error("Error creating transaction:", error);
      }
    };

    const startEdit = (transaction) => {
      editingTransaction.value = transaction;
      editAmount.value = Math.abs(transaction.amount);
      editCategory.value = transaction.category;
      editDescription.value = transaction.description || "";
      editType.value = transaction.type;
    };

    const cancelEdit = () => {
      editingTransaction.value = null;
      editAmount.value = 0;
      editCategory.value = "";
      editDescription.value = "";
      editType.value = "income";
    };

    const saveEdit = async () => {
      if (!editingTransaction.value) return;

      try {
        await updateTransactionMutation({
          id: editingTransaction.value.id,
          amount: parseFloat(editAmount.value) * (editType.value === "income" ? 1 : -1),
          category: editCategory.value,
          description: editDescription.value,
          type: editType.value,
        });
        await updateSelectedProjectStats();
        cancelEdit();
      } catch (error) {
        console.error("Error updating transaction:", error);
      }
    };

    // === ФУНКЦИИ УДАЛЕНИЯ ===

    const confirmDelete = (transaction) => {
      deleteConfirmation.value = {
        show: true,
        transactionId: transaction.id,
        transactionName: `${transaction.category} - ${Math.abs(transaction.amount)} ₽`,
      };
    };

    const cancelDelete = () => {
      deleteConfirmation.value = { show: false, transactionId: null, transactionName: "" };
    };

    const executeDelete = async () => {
      if (!deleteConfirmation.value.transactionId) return;

      try {
        await deleteTransactionMutation({ id: deleteConfirmation.value.transactionId });
        await updateSelectedProjectStats();
        cancelDelete();
      } catch (error) {
        console.error("Error deleting transaction:", error);
        cancelDelete();
      }
    };

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

    const updateSelectedProjectStats = async () => {
      await refetchAllTransactions({ userId: user.value.id });
      await refetchTransactions({ projectId: selectedProject.value.id });
      const updatedProjects = projectsWithProgress.value;
      const updatedProject = updatedProjects.find((p) => p.id === selectedProject.value.id);
      if (updatedProject) {
        selectedProject.value = { ...updatedProject };
      }
    };

    const formatDate = (timestamp) => {
      if (!timestamp) return "Нет даты";
      try {
        const date = new Date(parseInt(timestamp));

        if (isNaN(date.getTime())) {
          return "Неверная дата";
        }

        return date.toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return "Ошибка даты";
      }
    };

    // === ВОЗВРАЩАЕМЫЕ ДАННЫЕ ===

    return {
      user,
      name,
      email,
      password,
      loading,
      newProjectName,
      newProjectBudget,
      showRegister,
      selectedProject,
      projects: projectsWithProgress,
      showTransactionForm,
      transactionAmount,
      transactionCategory,
      transactionDescription,
      transactionType,
      transactions,
      editingTransaction,
      editAmount,
      editCategory,
      editDescription,
      editType,
      deleteConfirmation,
      selectProject,
      backToProjects,
      createTransaction,
      formatDate,
      register,
      login,
      logout,
      createProject,
      startEdit,
      cancelEdit,
      saveEdit,
      confirmDelete,
      cancelDelete,
      executeDelete,
    };
  },
};
</script>

<template>
  <!-- Основной контейнер приложения -->
  <div class="min-h-screen bg-gray-50 py-8">
    <div class="max-w-2xl mx-auto px-4">
      <!-- Заголовок -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900">💰 Финансовая аналитика</h1>
        <p class="text-gray-600 mt-2">Управляй своими проектами и бюджетом</p>
      </div>
      <!-- Блок авторизации -->
      <div v-if="!user" class="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">
          {{ showRegister ? "Регистрация" : "Вход" }}
        </h3>
        <!-- Форма входа/регистрации -->
        <div class="space-y-3 mb-4">
          <!-- Имя (только для регистрации) -->
          <input v-if="showRegister" v-model="name" placeholder="Ваше имя" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          <!-- email -->
          <input v-model="email" placeholder="Email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
          <!-- password -->
          <input v-model="password" type="password" :placeholder="showRegister ? 'Придумайте пароль' : 'Пароль'" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
        </div>
        <!-- Кнопки действий -->
        <div class="flex gap-3">
          <button @click="showRegister ? register() : login()" :disabled="!email || !password || (showRegister && !name)" class="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors">
            {{ showRegister ? "Зарегистрироваться" : "Войти" }}
          </button>
        </div>
        <!-- Переключение между входом и регистрацией -->
        <button
          @click="
            showRegister = !showRegister;
            name = '';
            password = '';
            email = '';
          "
          class="mt-3 text-sm text-blue-600 hover:text-blue-800">
          {{ showRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться" }}
        </button>
      </div>
      <!-- Основной интерфейс (показывается после входа) -->
      <div v-else>
        <!-- Шапка с приветствием и кнопкой выхода -->
        <div class="flex justify-between items-center mb-6">
          <div>
            <h2 class="text-xl font-semibold">Добро пожаловать, {{ user.name || user.email }}!</h2>
            <p class="text-gray-600 text-sm">{{ user.email }}</p>
          </div>
          <button @click="logout()" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Выйти</button>
        </div>
        <!-- Список проектов -->
        <div v-if="!selectedProject">
          <!-- Форма создания нового проекта -->
          <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">Создать проект</h3>
            <div class="flex gap-3 flex-col sm:flex-row">
              <input v-model="newProjectName" placeholder="Название проекта" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              <input v-model.number="newProjectBudget" type="number" placeholder="Бюджет" class="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              <button @click="createProject" :disabled="!newProjectName" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">Создать</button>
            </div>
          </div>
          <!-- Список существующих проектов -->
          <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">Мои проекты</h3>
            <!-- Индикатор загрузки -->
            <div v-if="loading" class="text-center py-4">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p class="text-gray-600 mt-2">Загрузка проектов...</p>
            </div>
            <div v-else>
              <!-- Сообщение если проектов нет -->
              <div v-if="projects.length === 0" class="text-center py-8 text-gray-500">Нет проектов. Создайте первый!</div>
              <!-- Список проектов -->
              <div v-else class="space-y-3">
                <div v-for="project in projects" :key="project.id" @click="selectProject(project)" class="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                  <div>
                    <span class="font-medium text-gray-900">{{ project.name }}</span>
                  </div>
                  <div class="text-right">
                    <!-- Отображение баланса с цветом в зависимости от прогресса -->
                    <div
                      class="text-lg font-bold"
                      :class="{
                        'text-green-600': project.current_balance >= project.budget,
                        'text-blue-600': project.current_balance < project.budget,
                      }">
                      {{ project.current_balance.toLocaleString() }} ₽
                    </div>
                    <div class="text-sm text-gray-500">из {{ project.budget.toLocaleString() }} ₽</div>
                    <div class="text-xs text-gray-400 mt-1">{{ Math.round(project.progress_percent) }}% выполнено</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Детали проекта (если проект выбран) -->
        <div v-else>
          <!-- Шапка проекта с основной информацией -->
          <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <div class="flex justify-between items-center mb-4">
              <div>
                <!-- Кнопка возврата к списку проектов -->
                <button @click="backToProjects" class="flex items-center text-blue-600 hover:text-blue-800 mb-2">← Назад к проектам</button>
                <h2 class="text-2xl font-bold text-gray-900">{{ selectedProject.name }}</h2>
                <div class="text-gray-600">
                  <div>
                    Накоплено: <span class="font-semibold">{{ selectedProject.current_balance.toLocaleString() }} ₽</span>
                  </div>
                  <div>Цель: {{ selectedProject.budget.toLocaleString() }} ₽</div>
                  <div class="text-sm text-blue-600 mt-1">Выполнено на {{ Math.round(selectedProject.progress_percent) }}%</div>
                </div>
              </div>
              <!-- Кнопка добавления транзакции -->
              <button @click="showTransactionForm = !showTransactionForm" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                {{ showTransactionForm ? "Отмена" : "+ Добавить транзакцию" }}
              </button>
            </div>
            <!-- Форма добавления транзакции -->
            <div v-if="showTransactionForm" class="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 class="text-lg font-semibold mb-4">Новая транзакция</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Тип</label>
                  <select v-model="transactionType" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="income">Доход</option>
                    <option value="expense">Расход</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Сумма</label>
                  <input v-model.number="transactionAmount" type="number" placeholder="0.00" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                  <input v-model="transactionCategory" placeholder="Например: Еда, Транспорт" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div class="md:col-span-2">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                  <input v-model="transactionDescription" placeholder="Необязательное описание" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <button @click="createTransaction" :disabled="!transactionAmount || !transactionCategory" class="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors">Создать транзакцию</button>
            </div>
          </div>
          <!-- Список транзакций проекта -->
          <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">История транзакций</h3>
            <!-- Сообщение если транзакций нет -->
            <div v-if="transactions.length === 0" class="text-center py-8 text-gray-500">Нет транзакций. Добавьте первую!</div>
            <!-- Список транзакций -->
            <div v-else class="space-y-3">
              <div
                v-for="transaction in transactions"
                :key="transaction.id"
                class="border rounded-lg transition-all duration-300"
                :class="editingTransaction?.id === transaction.id ? (editType === 'income' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : transaction.type === 'income' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
                <!-- Режим редактирования транзакции -->
                <div v-if="editingTransaction?.id === transaction.id" class="p-4">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Тип</label>
                      <select v-model="editType" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="editType === 'income' ? 'border-green-300' : 'border-red-300'">
                        <option value="income">Доход</option>
                        <option value="expense">Расход</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Сумма</label>
                      <input v-model.number="editAmount" type="number" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="editType === 'income' ? 'border-green-300' : 'border-red-300'" />
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                      <input v-model="editCategory" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="editType === 'income' ? 'border-green-300' : 'border-red-300'" />
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                      <input v-model="editDescription" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" :class="editType === 'income' ? 'border-green-300' : 'border-red-300'" />
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button @click="saveEdit" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Сохранить</button>
                    <button @click="cancelEdit" class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors">Отмена</button>
                  </div>
                </div>
                <!-- Режим просмотра транзакции -->
                <div v-else class="flex justify-between items-center p-4 group">
                  <div class="flex-1">
                    <div class="flex items-center gap-3">
                      <!-- Бейдж типа транзакции -->
                      <span class="px-2 py-1 text-xs font-medium rounded-full" :class="transaction.type === 'income' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'">
                        {{ transaction.type === "income" ? "Доход" : "Расход" }}
                      </span>
                      <span class="font-medium text-gray-900">{{ transaction.category }}</span>
                    </div>
                    <!-- Описание транзакции (если есть) -->
                    <p v-if="transaction.description" class="text-sm text-gray-600 mt-1">
                      {{ transaction.description }}
                    </p>
                    <!-- Дата транзакции -->
                    <p class="text-xs text-gray-500 mt-1">
                      {{ formatDate(transaction.created_at) }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-lg font-bold" :class="transaction.type === 'income' ? 'text-green-600' : 'text-red-600'"> {{ transaction.type === "income" ? "+" : "-" }}{{ Math.abs(transaction.amount).toLocaleString() }} ₽ </span>
                    <!-- Кнопки действий (появляются при наведении) -->
                    <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ml-2">
                      <button @click="startEdit(transaction)" class="p-1 text-blue-600 hover:text-blue-800 transition-colors" title="Редактировать">✏️</button>
                      <button @click="confirmDelete(transaction)" class="p-1 text-red-600 hover:text-red-800 transition-colors" title="Удалить">🗑️</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Окно подтверждения удаления -->
          <div v-if="deleteConfirmation.show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 mx-4 max-w-md w-full">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Подтверждение удаления</h3>
              <p class="text-gray-600 mb-4">
                Вы уверены, что хотите удалить транзакцию
                <span class="font-medium">"{{ deleteConfirmation.transactionName }}"</span>?
              </p>
              <div class="flex gap-3 justify-end">
                <button @click="cancelDelete" class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Отмена</button>
                <button @click="executeDelete" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Удалить</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
