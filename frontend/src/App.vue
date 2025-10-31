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
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 py-8 animate-gradient-x">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Заголовок -->
      <div class="text-center mb-12">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 rounded-2xl shadow-lg mb-4 animate-gradient bg-[length:200%_200%]">
          <span class="text-2xl text-white">💰</span>
        </div>
        <h1 class="text-4xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent mb-3 animate-gradient bg-[length:200%_200%]">Финансовая аналитика</h1>
        <p class="text-gray-600 text-lg max-w-md mx-auto">Управляйте бюджетами проектов и отслеживайте финансовые потоки</p>
      </div>

      <!-- Блок авторизации -->
      <div v-if="!user" class="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
        <div class="text-center mb-6">
          <h3 class="text-2xl font-bold text-gray-900 mb-2">
            {{ showRegister ? "Создать аккаунт" : "Вход в систему" }}
          </h3>
          <p class="text-gray-600">{{ showRegister ? "Зарегистрируйтесь для начала работы" : "Войдите в свой аккаунт" }}</p>
        </div>

        <!-- Форма входа/регистрации -->
        <div class="space-y-4 mb-6">
          <input
            v-if="showRegister"
            v-model="name"
            placeholder="Ваше имя"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 bg-gray-50 focus:bg-white" />
          <input v-model="email" type="email" placeholder="Email" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 bg-gray-50 focus:bg-white" />
          <input
            v-model="password"
            type="password"
            :placeholder="showRegister ? 'Придумайте пароль' : 'Пароль'"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 bg-gray-50 focus:bg-white" />
        </div>

        <!-- Кнопки действий -->
        <div class="flex gap-3 mb-4">
          <button
            @click="showRegister ? register() : login()"
            :disabled="!email || !password || (showRegister && !name)"
            class="flex-1 px-6 py-3 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-500 hover:via-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-400 transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none font-medium animate-gradient bg-[length:200%_200%]">
            {{ showRegister ? "Создать аккаунт" : "Войти" }}
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
          class="w-full text-center text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
          {{ showRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться" }}
        </button>
      </div>

      <!-- Основной интерфейс (показывается после входа) -->
      <div v-else>
        <!-- Шапка с приветствием и кнопкой выхода -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 p-6 bg-white rounded-2xl shadow-lg border border-gray-100">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg animate-gradient bg-[length:200%_200%]">
              <span class="text-white font-bold text-lg">{{ user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase() }}</span>
            </div>
            <div>
              <h2 class="text-xl font-bold text-gray-900">Добро пожаловать, {{ user.name || user.email }}!</h2>
              <p class="text-gray-600">{{ user.email }}</p>
            </div>
          </div>
          <button
            @click="logout()"
            class="px-6 py-2.5 bg-gradient-to-r from-red-500 via-red-600 to-red-500 text-white rounded-xl hover:from-red-600 hover:via-red-700 hover:to-red-600 transition-all duration-200 shadow-lg hover:shadow-xl font-medium flex items-center gap-2 animate-gradient bg-[length:200%_200%]">
            <span>🚪</span> Выйти
          </button>
        </div>

        <!-- Список проектов -->
        <div v-if="!selectedProject">
          <!-- Форма создания нового проекта -->
          <div class="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-gray-100">
            <h3 class="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span class="w-2 h-2 bg-blue-500 rounded-full"></span>
              Создать новый проект
            </h3>
            <div class="flex flex-col sm:flex-row gap-4">
              <div class="flex-1">
                <input
                  v-model="newProjectName"
                  placeholder="Название проекта"
                  class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 bg-gray-50 focus:bg-white" />
              </div>
              <div class="sm:w-48">
                <input
                  v-model.number="newProjectBudget"
                  type="number"
                  placeholder="Бюджет (₽)"
                  class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 bg-gray-50 focus:bg-white" />
              </div>
              <button
                @click="createProject"
                :disabled="!newProjectName"
                class="px-6 py-3 bg-gradient-to-r from-green-500 via-green-600 to-green-500 text-white rounded-xl hover:from-green-600 hover:via-green-700 hover:to-green-600 disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-400 transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none font-medium animate-gradient bg-[length:200%_200%]">
                Создать
              </button>
            </div>
          </div>

          <!-- Список существующих проектов -->
          <div class="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div class="flex justify-between items-center mb-6">
              <h3 class="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span class="w-2 h-2 bg-blue-500 rounded-full"></span>
                Мои проекты
              </h3>
              <span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"> {{ projects.length }} проект(ов) </span>
            </div>

            <!-- Индикатор загрузки -->
            <div v-if="loading" class="text-center py-8">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p class="text-gray-600">Загрузка проектов...</p>
            </div>

            <div v-else>
              <!-- Сообщение если проектов нет -->
              <div v-if="projects.length === 0" class="text-center py-12">
                <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span class="text-3xl text-gray-400">📁</span>
                </div>
                <h4 class="text-lg font-medium text-gray-900 mb-2">Нет проектов</h4>
                <p class="text-gray-600 max-w-sm mx-auto">Создайте первый проект для управления бюджетом и отслеживания транзакций</p>
              </div>

              <!-- Список проектов -->
              <div v-else class="grid gap-4">
                <div
                  v-for="project in projects"
                  :key="project.id"
                  @click="selectProject(project)"
                  class="group p-6 bg-gradient-to-r from-white to-gray-50 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:-translate-y-1">
                  <div class="flex justify-between items-start">
                    <div class="flex-1">
                      <h4 class="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                        {{ project.name }}
                      </h4>
                      <div class="flex items-center gap-4 text-sm text-gray-600 mb-3">
                        <span class="flex items-center gap-1">
                          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
                          Доходы: <span class="font-semibold text-green-600">{{ project.income.toLocaleString() }} ₽</span>
                        </span>
                        <span class="flex items-center gap-1">
                          <span class="w-2 h-2 bg-red-500 rounded-full"></span>
                          Расходы: <span class="font-semibold text-red-600">{{ project.expenses.toLocaleString() }} ₽</span>
                        </span>
                      </div>

                      <!-- Прогресс-бар -->
                      <div class="mb-2">
                        <div class="flex justify-between text-sm text-gray-600 mb-1">
                          <span>Прогресс</span>
                          <span class="font-semibold">{{ Math.round(project.progress_percent) }}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            class="h-2.5 rounded-full transition-all duration-500"
                            :class="{
                              'bg-green-500': project.progress_percent >= 100,
                              'bg-blue-500': project.progress_percent < 100 && project.progress_percent >= 50,
                              'bg-yellow-500': project.progress_percent < 50 && project.progress_percent > 0,
                              'bg-gray-300': project.progress_percent === 0,
                            }"
                            :style="{ width: `${Math.min(project.progress_percent, 100)}%` }"></div>
                        </div>
                      </div>
                    </div>

                    <div class="text-right ml-4">
                      <div
                        class="text-2xl font-bold mb-1"
                        :class="{
                          'text-green-600': project.current_balance >= project.budget,
                          'text-blue-600': project.current_balance < project.budget && project.current_balance >= project.budget * 0.5,
                          'text-yellow-600': project.current_balance < project.budget * 0.5 && project.current_balance > 0,
                          'text-gray-600': project.current_balance === 0,
                        }">
                        {{ project.current_balance.toLocaleString() }} ₽
                      </div>
                      <div class="text-sm text-gray-500">из {{ project.budget.toLocaleString() }} ₽</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Детали проекта (если проект выбран) -->
        <div v-else>
          <!-- Шапка проекта с основной информацией -->
          <div class="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-gray-100">
            <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-6">
              <div class="flex-1">
                <!-- Кнопка возврата к списку проектов -->
                <button @click="backToProjects" class="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium mb-4 transition-colors group">
                  <span class="transform group-hover:-translate-x-1 transition-transform">←</span>
                  Назад к проектам
                </button>

                <div class="flex items-center gap-4">
                  <div class="w-16 h-16 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg animate-gradient bg-[length:200%_200%]">
                    <span class="text-white text-2xl">📊</span>
                  </div>
                  <div>
                    <h2 class="text-3xl font-bold text-gray-900 mb-2">{{ selectedProject.name }}</h2>
                    <div class="flex flex-wrap gap-4 text-gray-600">
                      <div class="flex items-center gap-2">
                        <span class="w-2 h-2 bg-blue-500 rounded-full"></span>
                        Накоплено: <span class="font-semibold text-gray-900">{{ selectedProject.current_balance.toLocaleString() }} ₽</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="w-2 h-2 bg-purple-500 rounded-full"></span>
                        Цель: <span class="font-semibold text-gray-900">{{ selectedProject.budget.toLocaleString() }} ₽</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Прогресс-бар проекта -->
                <div class="mt-6 max-w-md">
                  <div class="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Прогресс выполнения</span>
                    <span class="font-semibold">{{ Math.round(selectedProject.progress_percent) }}%</span>
                  </div>
                  <div class="w-full bg-gray-200 rounded-full h-3">
                    <div
                      class="h-3 rounded-full transition-all duration-1000"
                      :class="{
                        'bg-green-500': selectedProject.progress_percent >= 100,
                        'bg-blue-500': selectedProject.progress_percent < 100 && selectedProject.progress_percent >= 50,
                        'bg-yellow-500': selectedProject.progress_percent < 50 && selectedProject.progress_percent > 0,
                        'bg-gray-300': selectedProject.progress_percent === 0,
                      }"
                      :style="{ width: `${Math.min(selectedProject.progress_percent, 100)}%` }"></div>
                  </div>
                </div>
              </div>

              <!-- Кнопка добавления транзакции -->
              <button
                @click="showTransactionForm = !showTransactionForm"
                class="px-6 py-3 bg-gradient-to-r from-green-500 via-green-600 to-green-500 text-white rounded-xl hover:from-green-600 hover:via-green-700 hover:to-green-600 transition-all duration-200 shadow-lg hover:shadow-xl font-medium flex items-center gap-2 animate-gradient bg-[length:200%_200%]">
                <span>{{ showTransactionForm ? "✕" : "+" }}</span>
                {{ showTransactionForm ? "Отмена" : "Добавить транзакцию" }}
              </button>
            </div>

            <!-- Форма добавления транзакции -->
            <div
              v-if="showTransactionForm"
              class="mt-6 p-6 rounded-2xl border transition-all duration-500"
              :class="transactionType === 'income' ? 'bg-gradient-to-r from-green-50/80 to-emerald-50/80 border-green-200' : 'bg-gradient-to-r from-red-50/80 to-orange-50/80 border-red-200'">
              <h3 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full transition-colors duration-300" :class="transactionType === 'income' ? 'bg-green-500' : 'bg-red-500'"></span>
                Новая транзакция
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Тип операции</label>
                  <select
                    v-model="transactionType"
                    class="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all duration-200 bg-white"
                    :class="transactionType === 'income' ? 'border-green-300 focus:border-green-500 text-green-700' : 'border-red-300 focus:border-red-500 text-red-700'">
                    <option value="income">📈 Доход</option>
                    <option value="expense">📉 Расход</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Сумма (₽)</label>
                  <input
                    v-model.number="transactionAmount"
                    type="number"
                    placeholder="0.00"
                    class="w-full px-4 py-3 border rounded-xl focus:ring-2 outline-none transition-all duration-200 bg-white"
                    :class="transactionType === 'income' ? 'border-green-300 focus:border-green-500 focus:ring-green-500' : 'border-red-300 focus:border-red-500 focus:ring-red-500'" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Категория</label>
                  <input
                    v-model="transactionCategory"
                    placeholder="Например: Еда, Транспорт"
                    class="w-full px-4 py-3 border rounded-xl focus:ring-2 outline-none transition-all duration-200 bg-white"
                    :class="transactionType === 'income' ? 'border-green-300 focus:border-green-500 focus:ring-green-500' : 'border-red-300 focus:border-red-500 focus:ring-red-500'" />
                </div>
                <div class="md:col-span-2">
                  <label class="block text-sm font-medium text-gray-700 mb-2">Описание</label>
                  <input
                    v-model="transactionDescription"
                    placeholder="Необязательное описание"
                    class="w-full px-4 py-3 border rounded-xl focus:ring-2 outline-none transition-all duration-200 bg-white"
                    :class="transactionType === 'income' ? 'border-green-300 focus:border-green-500 focus:ring-green-500' : 'border-red-300 focus:border-red-500 focus:ring-red-500'" />
                </div>
              </div>
              <button
                @click="createTransaction"
                :disabled="!transactionAmount || !transactionCategory"
                class="mt-6 px-6 py-3 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none font-medium animate-gradient bg-[length:200%_200%]"
                :class="
                  transactionType === 'income'
                    ? 'bg-gradient-to-r from-green-500 via-green-600 to-green-500 hover:from-green-600 hover:via-green-700 hover:to-green-600 disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-400'
                    : 'bg-gradient-to-r from-red-500 via-red-600 to-red-500 hover:from-red-600 hover:via-red-700 hover:to-red-600 disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-400'
                ">
                Создать транзакцию
              </button>
            </div>
          </div>

          <!-- Список транзакций проекта -->
          <div class="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div class="flex justify-between items-center mb-6">
              <h3 class="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span class="w-2 h-2 bg-orange-500 rounded-full"></span>
                История транзакций
              </h3>
              <span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"> {{ transactions.length }} транзакций </span>
            </div>

            <!-- Сообщение если транзакций нет -->
            <div v-if="transactions.length === 0" class="text-center py-12">
              <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span class="text-3xl text-gray-400">💸</span>
              </div>
              <h4 class="text-lg font-medium text-gray-900 mb-2">Нет транзакций</h4>
              <p class="text-gray-600 max-w-sm mx-auto">Добавьте первую транзакцию для отслеживания финансовых операций</p>
            </div>

            <!-- Список транзакций -->
            <div v-else class="space-y-3">
              <div
                v-for="transaction in transactions"
                :key="transaction.id"
                class="border rounded-xl transition-all duration-300 hover:shadow-md"
                :class="
                  editingTransaction?.id === transaction.id
                    ? editType === 'income'
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
                      : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-300'
                    : transaction.type === 'income'
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                    : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'
                ">
                <!-- Режим редактирования транзакции -->
                <div v-if="editingTransaction?.id === transaction.id" class="p-4">
                  <h4 class="font-semibold text-gray-900 mb-4">Редактирование транзакции</h4>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">Тип</label>
                      <select
                        v-model="editType"
                        class="w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none transition-colors"
                        :class="editType === 'income' ? 'border-green-300 bg-green-25 text-green-700 focus:ring-green-500' : 'border-red-300 bg-red-25 text-red-700 focus:ring-red-500'">
                        <option value="income">📈 Доход</option>
                        <option value="expense">📉 Расход</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">Сумма (₽)</label>
                      <input
                        v-model.number="editAmount"
                        type="number"
                        class="w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none transition-colors"
                        :class="editType === 'income' ? 'border-green-300 bg-green-25 text-green-700 focus:ring-green-500' : 'border-red-300 bg-red-25 text-red-700 focus:ring-red-500'" />
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-sm font-medium text-gray-700 mb-2">Категория</label>
                      <input
                        v-model="editCategory"
                        class="w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none transition-colors"
                        :class="editType === 'income' ? 'border-green-300 bg-green-25 text-green-700 focus:ring-green-500' : 'border-red-300 bg-red-25 text-red-700 focus:ring-red-500'" />
                    </div>
                    <div class="md:col-span-2">
                      <label class="block text-sm font-medium text-gray-700 mb-2">Описание</label>
                      <input
                        v-model="editDescription"
                        class="w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none transition-colors"
                        :class="editType === 'income' ? 'border-green-300 bg-green-25 text-green-700 focus:ring-green-500' : 'border-red-300 bg-red-25 text-red-700 focus:ring-red-500'" />
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button @click="saveEdit" class="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 font-medium">Сохранить</button>
                    <button @click="cancelEdit" class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium">Отмена</button>
                  </div>
                </div>

                <!-- Режим просмотра транзакции -->
                <div v-else class="flex justify-between items-center p-4 group">
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                      <!-- Бейдж типа транзакции -->
                      <span class="px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1 transition-colors duration-300" :class="transaction.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                        <span>{{ transaction.type === "income" ? "📈" : "📉" }}</span>
                        {{ transaction.type === "income" ? "Доход" : "Расход" }}
                      </span>
                      <span class="font-semibold text-gray-900">{{ transaction.category }}</span>
                    </div>

                    <!-- Описание транзакции (если есть) -->
                    <p v-if="transaction.description" class="text-sm text-gray-600 mb-1">
                      {{ transaction.description }}
                    </p>

                    <!-- Дата транзакции -->
                    <p class="text-xs text-gray-500">
                      {{ formatDate(transaction.created_at) }}
                    </p>
                  </div>

                  <div class="flex items-center gap-3">
                    <span class="text-lg font-bold transition-colors duration-300" :class="transaction.type === 'income' ? 'text-green-600' : 'text-red-600'">
                      {{ transaction.type === "income" ? "+" : "-" }}{{ Math.abs(transaction.amount).toLocaleString() }} ₽
                    </span>

                    <!-- Кнопки действий (появляются при наведении) -->
                    <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <button @click="startEdit(transaction)" class="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors" title="Редактировать">✏️</button>
                      <button @click="confirmDelete(transaction)" class="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors" title="Удалить">🗑️</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Окно подтверждения удаления -->
        <div v-if="deleteConfirmation.show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div class="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl transform transition-all">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-red-600 text-xl">⚠️</span>
            </div>
            <h3 class="text-xl font-bold text-gray-900 text-center mb-2">Подтверждение удаления</h3>
            <p class="text-gray-600 text-center mb-6">
              Вы уверены, что хотите удалить транзакцию
              <span class="font-semibold text-gray-900">"{{ deleteConfirmation.transactionName }}"</span>?
            </p>
            <div class="flex gap-3">
              <button @click="cancelDelete" class="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">Отмена</button>
              <button
                @click="executeDelete"
                class="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 via-red-600 to-red-500 text-white rounded-xl hover:from-red-600 hover:via-red-700 hover:to-red-600 transition-all duration-200 font-medium animate-gradient bg-[length:200%_200%]">
                Удалить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes gradient {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.animate-gradient {
  background-size: 200% 200%;
  animation: gradient 6s ease infinite;
}
</style>
