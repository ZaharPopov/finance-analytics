// Тестируем чистую логику расчетов без БД и зависимостей
function calculateProjectStats(project, transactions) {
  const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const expenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const balance = income - expenses;
  const progress = project.budget > 0 ? (balance / project.budget) * 100 : 0;

  return {
    current_balance: balance,
    progress_percent: Math.max(0, Math.min(progress, 100)), // ФИКС: не отрицательный прогресс
    income,
    expenses,
  };
}

// Твоя функция форматирования даты из App.vue
function formatDate(timestamp) {
  if (!timestamp) return "Нет даты";
  try {
    const date = new Date(parseInt(timestamp));
    if (isNaN(date.getTime())) return "Неверная дата";

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
}

describe("Financial Calculations", () => {
  test("calculates project stats correctly with mixed transactions", () => {
    const project = { budget: 1000 };
    const transactions = [
      { amount: 500, type: "income" },
      { amount: 200, type: "expense" },
      { amount: 300, type: "income" },
    ];

    const result = calculateProjectStats(project, transactions);

    expect(result.current_balance).toBe(600); // 500+300-200=600
    expect(result.progress_percent).toBe(60); // 600/1000*100=60%
    expect(result.income).toBe(800);
    expect(result.expenses).toBe(200);
  });

  test("handles only income transactions", () => {
    const project = { budget: 2000 };
    const transactions = [
      { amount: 1000, type: "income" },
      { amount: 500, type: "income" },
    ];

    const result = calculateProjectStats(project, transactions);

    expect(result.current_balance).toBe(1500);
    expect(result.progress_percent).toBe(75);
    expect(result.income).toBe(1500);
    expect(result.expenses).toBe(0);
  });

  test("handles only expense transactions - progress should be 0%", () => {
    const project = { budget: 500 };
    const transactions = [
      { amount: 100, type: "expense" },
      { amount: 50, type: "expense" },
    ];

    const result = calculateProjectStats(project, transactions);

    expect(result.current_balance).toBe(-150);
    expect(result.progress_percent).toBe(0); // ФИКС: прогресс не может быть отрицательным
    expect(result.income).toBe(0);
    expect(result.expenses).toBe(150);
  });

  test("handles zero budget project", () => {
    const project = { budget: 0 };
    const transactions = [{ amount: 100, type: "income" }];

    const result = calculateProjectStats(project, transactions);

    expect(result.current_balance).toBe(100);
    expect(result.progress_percent).toBe(0); // При нулевом бюджете прогресс 0
  });

  test("progress never exceeds 100%", () => {
    const project = { budget: 500 };
    const transactions = [{ amount: 600, type: "income" }];

    const result = calculateProjectStats(project, transactions);

    expect(result.current_balance).toBe(600);
    expect(result.progress_percent).toBe(100); // Ограничено 100%
  });

  test("progress never goes below 0%", () => {
    const project = { budget: 100 };
    const transactions = [{ amount: 150, type: "expense" }];

    const result = calculateProjectStats(project, transactions);

    expect(result.current_balance).toBe(-150);
    expect(result.progress_percent).toBe(0); // Не может быть отрицательным
  });
});

describe("Date Formatting", () => {
  test("formats valid timestamp correctly", () => {
    const timestamp = "1704067200000"; // 1 января 2024
    const result = formatDate(timestamp);

    expect(result).toContain("01.01.2024");
  });

  test("handles invalid timestamp", () => {
    expect(formatDate("invalid")).toBe("Неверная дата");
    expect(formatDate(null)).toBe("Нет даты");
    expect(formatDate(undefined)).toBe("Нет даты");
  });

  test("handles empty timestamp", () => {
    expect(formatDate("")).toBe("Нет даты");
  });
});
