export type TxType = 'expense' | 'income' | 'transfer';

export type CategoryCandidate = {
  name: string;
  aliases: string[];
  priority: number;
  typeHint?: TxType;
};

export type CategoryInferenceResult = {
  canonicalName: string;
  aliases: string[];
  priority: number;
  typeHint?: TxType;
  reason: string;
};

const normalizeText = (value: unknown) => {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:()\[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const hasAny = (text: string, keywords: string[]) => {
  const value = normalizeText(text);
  return keywords.some((keyword) => value.includes(normalizeText(keyword)));
};

const makeCandidate = (
  name: string,
  aliases: string[],
  priority: number,
  reason: string,
  typeHint?: TxType
): CategoryInferenceResult => ({
  canonicalName: name,
  aliases: [name, ...aliases],
  priority,
  reason,
  typeHint,
});

/**
 * Глобальная семантическая классификация категорий.
 *
 * Она специально сильнее, чем сырой ответ AI.
 * Например, если AI ошибочно вернул "Покупки", но в тексте есть "кино",
 * выбираем "Развлечения".
 */
export const inferCategoryFromText = (text: string): CategoryInferenceResult | null => {
  const value = normalizeText(text);
  const candidates: CategoryInferenceResult[] = [];

  // Долги: важно различать, кто кому вернул.
  if (
    hasAny(value, [
      'отдали долг',
      'мне отдали долг',
      'мне вернули долг',
      'вернули долг',
      'вернул долг мне',
      'возврат долга',
      'должник вернул',
      'долг вернули',
      'долг отдали',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Долг',
        ['Долги', 'Возврат долга', 'Займы'],
        130,
        'возврат долга',
        'income'
      )
    );
  }

  if (
    hasAny(value, [
      'отдал долг',
      'я отдал долг',
      'вернул долг',
      'погасил долг',
      'заплатил долг',
      'закрыл долг',
      'долг отдал',
      'долг оплатил',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Долг',
        ['Долги', 'Возврат долга', 'Займы'],
        125,
        'оплата долга',
        'expense'
      )
    );
  }

  if (
    hasAny(value, [
      'долг',
      'долги',
      'одолжил',
      'занял',
      'займ',
      'заем',
      'заём',
      'в долг',
      'должен',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Долг',
        ['Долги', 'Возврат долга', 'Займы'],
        115,
        'упоминание долга'
      )
    );
  }

  // Развлечения: кино не должно попадать в покупки.
  if (
    hasAny(value, [
      'кино',
      'кинотеатр',
      'фильм',
      'билет в кино',
      'сходил в кино',
      'сходили в кино',
      'смотрел фильм',
      'movie',
      'cinema',
      'chaplin',
      'кинопарк',
      'kinopark',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Развлечения',
        ['Отдых', 'Досуг', 'Кино', 'Кинотеатр'],
        120,
        'кино / фильм'
      )
    );
  }

  if (
    hasAny(value, [
      'театр',
      'концерт',
      'караоке',
      'боулинг',
      'квест',
      'парк',
      'аттракцион',
      'игровой клуб',
      'playstation',
      'плейстейшн',
      'бильярд',
      'каток',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Развлечения',
        ['Отдых', 'Досуг'],
        105,
        'развлечения'
      )
    );
  }

  // Еда / кафе
  if (
    hasAny(value, [
      'кофе',
      'латте',
      'капучино',
      'американо',
      'starbucks',
      'старбакс',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Кофе',
        ['Кафе', 'Еда'],
        95,
        'кофе'
      )
    );
  }

  if (
    hasAny(value, [
      'кафе',
      'ресторан',
      'обед',
      'ужин',
      'завтрак',
      'донер',
      'шаурма',
      'бургер',
      'пицца',
      'kfc',
      'мак',
      'mcdonald',
      'еда',
      'поел',
      'покушал',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Кафе',
        ['Еда', 'Рестораны'],
        90,
        'кафе / еда вне дома'
      )
    );
  }

  if (
    hasAny(value, [
      'продукты',
      'продукт',
      'магнум',
      'small',
      'смолл',
      'супермаркет',
      'магазин еды',
      'еда домой',
      'купил продукты',
      'закупился',
      'овощи',
      'фрукты',
      'хлеб',
      'молоко',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Продукты',
        ['Еда', 'Супермаркет'],
        88,
        'продукты'
      )
    );
  }

  // Транспорт
  if (
    hasAny(value, [
      'такси',
      'яндекс такси',
      'yandex',
      'indrive',
      'индрайв',
      'uber',
      'убер',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Такси',
        ['Транспорт'],
        95,
        'такси'
      )
    );
  }

  if (
    hasAny(value, [
      'автобус',
      'метро',
      'транспорт',
      'проезд',
      'онай',
      'onay',
      'бензин',
      'заправка',
      'парковка',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Транспорт',
        ['Проезд', 'Авто'],
        85,
        'транспорт'
      )
    );
  }

  // Здоровье
  if (
    hasAny(value, [
      'аптека',
      'лекарство',
      'лекарства',
      'врач',
      'клиника',
      'анализ',
      'стоматолог',
      'лечение',
      'больница',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Здоровье',
        ['Аптека', 'Медицина'],
        90,
        'здоровье'
      )
    );
  }

  // Образование
  if (
    hasAny(value, [
      'учеба',
      'учёба',
      'универ',
      'университет',
      'курс',
      'курсы',
      'обучение',
      'книга',
      'книги',
      'подписка на курс',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Образование',
        ['Учеба', 'Учёба'],
        85,
        'образование'
      )
    );
  }

  // Коммуналка / связь
  if (
    hasAny(value, [
      'коммуналка',
      'коммунальные',
      'свет',
      'газ',
      'вода',
      'квартплата',
      'аренда',
      'квартира',
      'интернет',
      'телефон',
      'связь',
      'мобильная связь',
      'баланс телефона',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Коммунальные',
        ['Связь', 'Дом', 'Интернет'],
        80,
        'коммунальные / связь'
      )
    );
  }

  // Подписки
  if (
    hasAny(value, [
      'подписка',
      'netflix',
      'spotify',
      'youtube',
      'яндекс плюс',
      'kaspi gold подписка',
      'чатгпт',
      'chatgpt',
      'icloud',
      'google one',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Подписки',
        ['Сервисы'],
        86,
        'подписки'
      )
    );
  }

  // Покупки только когда нет более сильных признаков.
  if (
    hasAny(value, [
      'покупка',
      'покупки',
      'купил',
      'купила',
      'заказал',
      'заказ',
      'маркетплейс',
      'wildberries',
      'вайлдберриз',
      'ozon',
      'озон',
      'kaspi магазин',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Покупки',
        ['Разное'],
        50,
        'общая покупка'
      )
    );
  }

  // Одежда и техника должны быть точнее покупок.
  if (
    hasAny(value, [
      'одежда',
      'кроссовки',
      'обувь',
      'футболка',
      'штаны',
      'джинсы',
      'куртка',
      'кофта',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Одежда',
        ['Покупки'],
        80,
        'одежда'
      )
    );
  }

  if (
    hasAny(value, [
      'техника',
      'телефон',
      'ноутбук',
      'компьютер',
      'наушники',
      'зарядка',
      'мышка',
      'клавиатура',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Техника',
        ['Покупки', 'Электроника'],
        80,
        'техника'
      )
    );
  }

  // Доходы
  if (
    hasAny(value, [
      'зарплата',
      'аванс',
      'премия',
      'получил зарплату',
      'зп',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Зарплата',
        ['Доход'],
        120,
        'зарплата',
        'income'
      )
    );
  }

  if (
    hasAny(value, [
      'подработка',
      'фриланс',
      'заказ оплатили',
      'оплатили работу',
      'доход',
      'поступление',
    ])
  ) {
    candidates.push(
      makeCandidate(
        'Подработка',
        ['Доход', 'Фриланс'],
        100,
        'подработка',
        'income'
      )
    );
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.priority - a.priority);

  return candidates[0];
};

export const inferTransactionTypeFromText = (text: string): TxType | null => {
  const value = normalizeText(text);

  if (
    hasAny(value, [
      'мне отдали долг',
      'отдали долг',
      'мне вернули долг',
      'вернули долг',
      'получил зарплату',
      'зарплата',
      'аванс',
      'премия',
      'поступление',
      'доход',
      'оплатили работу',
      'заказ оплатили',
    ])
  ) {
    return 'income';
  }

  if (
    hasAny(value, [
      'я отдал долг',
      'отдал долг',
      'вернул долг',
      'погасил долг',
      'заплатил долг',
      'купил',
      'сходил',
      'потратил',
      'оплатил',
    ])
  ) {
    return 'expense';
  }

  if (
    hasAny(value, [
      'перевел',
      'перевёл',
      'перекинул',
      'перевод',
      'с карты на карту',
      'между счетами',
    ])
  ) {
    return 'transfer';
  }

  return null;
};

export const getCandidateNames = (result: CategoryInferenceResult | null) => {
  if (!result) return [];
  return result.aliases;
};

export const normalizeCategoryText = normalizeText;
