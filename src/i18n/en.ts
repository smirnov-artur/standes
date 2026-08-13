/**
 * Английский словарь. Ключ — русская строка из кода.
 *
 * Правило перевода: это интерфейс торгового оборудования, а не художественный
 * текст. Термины берутся из отраслевого английского (shelving / retail fixtures),
 * а не переводятся дословно:
 *   стеллаж (торговый) → shelving unit / gondola      полка → shelf
 *   стойка             → upright                      кронштейн → bracket
 *   отбортовка         → front lip                    ценникодержатель → price rail
 *   база               → base deck                    карниз → header
 *   корпус             → carcass                      царга → rail
 *   ЛДСП               → melamine board               МДФ → MDF
 *   раскрой            → cutting plan                 кромка → edge banding
 *   смета              → bill of materials            цоколь → plinth
 */

export const EN: Record<string, string> = {
  // ── общее ────────────────────────────────────────────────────────────────
  'торговое оборудование': 'retail fixtures',
  Отмена: 'Cancel',
  Закрыть: 'Close',
  Готово: 'Done',
  Понятно: 'Got it',
  Удалить: 'Delete',
  Добавить: 'Add',
  Дублировать: 'Duplicate',
  Сбросить: 'Reset',
  Применить: 'Apply',
  Выровнять: 'Distribute',
  Печать: 'Print',
  Экспорт: 'Export',
  Поделиться: 'Share',
  Итого: 'Total',
  ИТОГО: 'TOTAL',
  Всего: 'Total',
  'Нет': 'None',
  'Все': 'All',
  Авто: 'Auto',
  мм: 'mm',
  'м²': 'm²',
  кг: 'kg',
  шт: 'pcs',
  'пог. м': 'lin. m',

  // ── режимы и виды ────────────────────────────────────────────────────────
  '3D': '3D',
  План: 'Plan',
  Фасад: 'Elevation',
  'Перспектива (3D)': 'Perspective (3D)',
  'Вид сверху (план)': 'Top view (plan)',
  'Вид спереди (фасад)': 'Front view (elevation)',
  'Режим менеджера': 'Manager mode',
  'Режим клиента': 'Customer mode',

  // ── панели ───────────────────────────────────────────────────────────────
  Сцена: 'Scene',
  Библиотека: 'Library',
  Стеллажи: 'Units',
  Инспектор: 'Inspector',
  Каркас: 'Frame',
  Ячейки: 'Cells',
  Материалы: 'Materials',
  Положение: 'Position',
  Комната: 'Room',
  // подпись ВКЛАДКИ: 'Bill of materials' не влезает в сегментированный контрол
  Спецификация: 'Parts list',
  Раскрой: 'Cutting plan',
  Смета: 'Estimate',

  // ── каркас ───────────────────────────────────────────────────────────────
  Габариты: 'Dimensions',
  ГАБАРИТЫ: 'DIMENSIONS',
  Ширина: 'Width',
  Высота: 'Height',
  Глубина: 'Depth',
  Боковины: 'Side panels',
  Полки: 'Shelves',
  Полок: 'Shelves',
  Конструкция: 'Construction',
  Корпус: 'Carcass',
  Торговый: 'Retail',
  Профиль: 'Profile',
  Связи: 'Bracing',
  Жёсткость: 'Rigidity',
  Колонки: 'Columns',
  КОЛОНКИ: 'COLUMNS',
  Ряды: 'Rows',
  РЯДЫ: 'ROWS',
  Количество: 'Quantity',
  Колонка: 'Column',
  Ряд: 'Row',
  'Задняя стенка': 'Back panel',
  'ЗАДНЯЯ СТЕНКА': 'BACK PANEL',
  Тип: 'Type',
  Сплошная: 'Solid',
  'По ячейкам': 'Per cell',
  Толщина: 'Thickness',
  Опоры: 'Feet',
  ОПОРЫ: 'FEET',
  Цоколь: 'Plinth',
  Ножки: 'Legs',
  Шпильки: 'Hairpin',
  'Высота опор': 'Foot height',
  Свес: 'Overhang',
  'Ряд 1 — нижний. Список идёт сверху вниз.':
    'Row 1 is the bottom one. The list reads top to bottom.',

  // ── торговый стеллаж ─────────────────────────────────────────────────────
  'Торговый стеллаж': 'Retail shelving',
  'Ширина стойки': 'Upright width',
  'Глубина базы': 'Base depth',
  'Глубина полок': 'Shelf depth',
  'Высота базы': 'Base height',
  'Наклон полок': 'Shelf tilt',
  Отбортовка: 'Front lip',
  Карниз: 'Header',
  Ценникодержатели: 'Price rails',
  Ценники: 'Price rails',
  'Перфорация стенки': 'Perforated back',
  'Двусторонний (островной)': 'Double-sided (gondola)',
  'Наклонные полки': 'Tilted shelves',
  'Стойка перфорированная': 'Perforated upright',
  'Стойки перфорированные': 'Perforated uprights',
  'Кронштейн полки': 'Shelf bracket',
  'Кронштейны полок': 'Shelf brackets',
  'Отбортовка полки': 'Shelf front lip',
  'Отбортовки полок': 'Shelf front lips',
  Ценникодержатель: 'Price rail',
  'Фронт базы': 'Base front panel',
  'Фронты базы': 'Base front panels',
  Карнизы: 'Headers',
  'Настил базы': 'Base deck',
  'Панель задняя': 'Back panel',
  'Панель задняя перфорированная': 'Perforated back panel',

  // ── детали ───────────────────────────────────────────────────────────────
  Полка: 'Shelf',
  'Боковина левая': 'Left side panel',
  'Боковина правая': 'Right side panel',
  Боковина: 'Side panel',
  Крышка: 'Top panel',
  Крышки: 'Top panels',
  Дно: 'Bottom panel',
  Столешница: 'Worktop',
  Перегородка: 'Divider',
  Перегородки: 'Dividers',
  'Полка дополнительная': 'Extra shelf',
  'Полки дополнительные': 'Extra shelves',
  Подперегородка: 'Sub-divider',
  Подперегородки: 'Sub-dividers',
  'Задние стенки': 'Back panels',
  'Фасад двери': 'Door front',
  'Фасад ящика': 'Drawer front',
  'Рейка фасада': 'Front slat',
  'Рама фасада': 'Front frame',
  'Панель-заглушка': 'Blank panel',
  'Царга ящика': 'Drawer rail',
  'Дно ящика': 'Drawer bottom',
  'Дно вкладное': 'Inset bottom',
  'Царга цоколя передняя': 'Front plinth rail',
  'Царга цоколя задняя': 'Rear plinth rail',
  'Царга цоколя левая': 'Left plinth rail',
  'Царга цоколя правая': 'Right plinth rail',
  Штанга: 'Hanging rail',
  Ручка: 'Handle',
  Короб: 'Storage box',
  Стойка: 'Post',
  Ригель: 'Beam',
  Связь: 'Brace',
  'Ножка круглая': 'Round leg',
  'Опора регулируемая': 'Leveling foot',

  // ── ячейки ───────────────────────────────────────────────────────────────
  Пусто: 'Empty',
  Ящики: 'Drawers',
  Дверь: 'Door',
  Двери: 'Doors',
  Панель: 'Panel',
  Слева: 'Left',
  Справа: 'Right',
  Вверх: 'Up',
  Глухая: 'Solid',
  Стекло: 'Glass',
  Реечная: 'Slatted',
  Гладкий: 'Flat',
  'С фрезеровкой': 'Grooved',
  'Без ручки': 'Handleless',
  'Залить всё': 'Fill all',
  Очистить: 'Clear',
  Отзеркалить: 'Mirror',
  Разъединить: 'Split',

  // ── материалы ────────────────────────────────────────────────────────────
  Дерево: 'Wood',
  Плита: 'Board',
  Металл: 'Metal',
  Прочее: 'Other',
  'Дуб натуральный': 'Natural oak',
  'Орех американский': 'American walnut',
  'Ясень белёный': 'Bleached ash',
  'Фанера берёзовая': 'Birch plywood',
  'ЛДСП белый': 'White melamine board',
  'ЛДСП графит': 'Graphite melamine board',
  'МДФ эмаль «песок»': 'MDF, sand lacquer',
  'МДФ эмаль «олива»': 'MDF, olive lacquer',
  'ХДФ задняя стенка': 'HDF back panel',
  'Сталь чёрная матовая': 'Matte black steel',
  'Сталь белая матовая': 'Matte white steel',
  'Нержавейка шлифованная': 'Brushed stainless steel',
  Латунь: 'Brass',
  'Стекло прозрачное': 'Clear glass',
  'Стекло дымчатое': 'Smoked glass',
  'Войлок серый': 'Grey felt',
  'Бетон (пол)': 'Concrete (floor)',
  'Бетон светлый': 'Light concrete',
  'Микроцемент серый': 'Grey microcement',
  'Дубовый пол': 'Oak floor',
  'Сталь RAL 9016 (белая)': 'Steel RAL 9016 (white)',
  'Сталь RAL 7035 (серая)': 'Steel RAL 7035 (grey)',
  'Сталь RAL 9005 (чёрная)': 'Steel RAL 9005 (black)',
  'Пластик ABS белый': 'White ABS plastic',

  // ── фурнитура ────────────────────────────────────────────────────────────
  Фурнитура: 'Hardware',
  'Петля мебельная': 'Cabinet hinge',
  'Направляющие скрытого монтажа, компл.': 'Concealed drawer slides, set',
  'Конфирмат 7×50': 'Confirmat screw 7×50',
  Полкодержатель: 'Shelf support pin',
  Штангодержатель: 'Rail bracket',
  'Уголок крепёжный к стене': 'Wall anchor bracket',
  'Саморез 4×16': 'Screw 4×16',
  Кромление: 'Edge banding',
  Кромка: 'Edging',

  // ── смета ────────────────────────────────────────────────────────────────
  Наименование: 'Item',
  Материал: 'Material',
  Размер: 'Size',
  'Кол.': 'Qty',
  Сумма: 'Amount',
  'цена/шт': 'unit price',
  'кромка, м': 'edging, m',
  Деталей: 'Parts',
  Площадь: 'Area',
  Масса: 'Weight',
  Список: 'List',
  Роли: 'Roles',
  Замечаний: 'Notes',
  'Экспорт CSV': 'Export CSV',
  Копировать: 'Copy',
  Листов: 'Sheets',
  Лист: 'Sheet',
  'Средний выход': 'Average yield',
  Отходы: 'Waste',
  Пропил: 'Kerf',
  'Отступ от края': 'Sheet margin',
  Волокна: 'Grain',
  позиций: 'items',

  // ── комната ──────────────────────────────────────────────────────────────
  'Размеры комнаты': 'Room dimensions',
  'РАЗМЕРЫ КОМНАТЫ': 'ROOM DIMENSIONS',
  'Толщина стен': 'Wall thickness',
  Плинтус: 'Skirting',
  Отделка: 'Finish',
  ОТДЕЛКА: 'FINISH',
  Стены: 'Walls',
  Потолок: 'Ceiling',
  Пол: 'Floor',
  'Цвет стен': 'Wall colour',
  'ЦВЕТ СТЕН': 'WALL COLOUR',
  Вид: 'View',
  ВИД: 'VIEW',
  'Сетка пола': 'Floor grid',
  Размеры: 'Dimensions',
  Магниты: 'Magnets',
  Призрак: 'Ghost',
  Окружение: 'Environment',
  Студия: 'Studio',
  Лофт: 'Loft',
  Тёплый: 'Warm',
  Ночь: 'Night',
  Занято: 'Occupied',
  'Авто — прячет стены, которые загораживают камеру.':
    'Auto hides the walls that block the camera.',
  'Стены можно тянуть мышью в режиме «План»': 'Drag the walls with the mouse in Plan view',

  // ── привязки ─────────────────────────────────────────────────────────────
  Сетка: 'Grid',
  Углы: 'Angles',
  Коллизии: 'Collisions',
  Привязки: 'Snapping',
  Открыть: 'Open',
  Разнести: 'Explode',
  'В линию': 'In line',
  'Спина к спине': 'Back to back',
  'Угол в угол (L)': 'Corner to corner (L)',
  'к задней стене': 'to the back wall',
  'к передней стене': 'to the front wall',
  'к левой стене': 'to the left wall',
  'к правой стене': 'to the right wall',
  'По сетке': 'To grid',
  'Пересечение!': 'Overlap!',
  'Пересечение — отменено': 'Overlap — cancelled',
  'Alt — временно отключить привязки': 'Hold Alt to disable snapping',
  'Кликните по стеллажу, чтобы выбрать': 'Click a unit to select it',

  // ── качество и тема ──────────────────────────────────────────────────────
  Низкое: 'Low',
  Среднее: 'Medium',
  Высокое: 'High',
  Максимум: 'Ultra',
  'Тёмная тема': 'Dark theme',
  'Светлая тема': 'Light theme',

  // ── проект ───────────────────────────────────────────────────────────────
  'Новый проект': 'New project',
  'Сохранить проект (.json)': 'Save project (.json)',
  'Открыть проект…': 'Open project…',
  'Спецификация (.csv)': 'Bill of materials (.csv)',
  'Карта раскроя (.csv)': 'Cutting plan (.csv)',
  'Спецификация (для печати)': 'Bill of materials (printable)',
  'Скриншот (.png)': 'Screenshot (.png)',
  'Модель (.glb)': '3D model (.glb)',
  'Копировать ссылку': 'Copy link',
  'Ссылка скопирована': 'Link copied',
  Документы: 'Documents',
  'Точно? Несохранённое пропадёт': 'Are you sure? Unsaved work will be lost',
  Создать: 'Create',

  // ── состояния ────────────────────────────────────────────────────────────
  'Выберите стеллаж': 'Select a unit',
  'Кликните по стеллажу в сцене или создайте новый':
    'Click a unit in the scene or create a new one',
  'Пока пусто': 'Nothing here yet',
  'Добавить стеллаж': 'Add a unit',
  'Пустой стеллаж': 'Blank unit',
  'Ничего не выбрано': 'Nothing selected',
  'Выбрано:': 'Selected:',
  'Не удалось рассчитать': 'Could not calculate',
  'Сбой:': 'Failed:',
  'Попробовать снова': 'Try again',

  // ── предупреждения ───────────────────────────────────────────────────────
  'Закрепите к стене (антиопрокидыватель)': 'Anchor to the wall (anti-tip)',
  'Стекло: закалённое, кромка полировка': 'Glass: tempered, polished edges',
  'Наклонная полка без отбортовки — товар соскользнёт':
    'A tilted shelf without a front lip will let goods slide off',
  'Полка глубже базы — опрокинется': 'Shelf deeper than the base — it will tip over',

  // ── клиентский режим ─────────────────────────────────────────────────────
  'Оставить заявку': 'Request a quote',
  Заявка: 'Quote request',
  'Ширина секции': 'Bay width',
  Цвет: 'Colour',
  'Добавить такую же': 'Add another one',
  Секций: 'Bays',
  'Общая длина': 'Total length',
  'Полок всего': 'Shelves in total',
  'Цена ориентировочная, окончательную подтвердит менеджер':
    'Indicative price — your account manager will confirm the final one',
  Имя: 'Name',
  Телефон: 'Phone',
  Комментарий: 'Comments',
  'Отправить заявку': 'Send request',
  'Заявка сохранена': 'Request saved',
  'Стандартная секция торгового зала': 'Standard sales-floor bay',
  'Высокая секция под крупный товар': 'Tall bay for bulky goods',
  'Проход с двух сторон': 'Shoppable from both sides',
  'Наклон 10° под выкладку': '10° tilt for display',
  'Эта секция настраивается в режиме менеджера': 'This unit is configured in manager mode',
  от: 'from',
  // ── документ ─────────────────────────────────────────────────────────────
  'STANDES — 3D конфигуратор торговых стеллажей': 'STANDES — 3D retail shelving configurator',

  // ── App: загрузка и области ошибок ───────────────────────────────────────
  'Проект загружен по ссылке': 'Project loaded from link',
  'Восстановлен последний проект': 'Last project restored',
  'Верхняя панель': 'Top bar',
  'Список стеллажей': 'Unit list',
  '3D-сцена': '3D scene',
  'Клиентский режим': 'Customer mode',

  // ── domain: единицы измерения (format.ts) ────────────────────────────────
  г: 'g',

  // ── domain: имя юнита и пресеты библиотеки (defaults.ts) ─────────────────
  Стеллаж: 'Shelving unit',
  // подписи карточек в витрине пресетов
  'Пристенный 1000×2000': 'Wall bay 1000×2000',
  'Пристенный 1250×2200': 'Wall bay 1250×2200',
  'Островной двусторонний': 'Double-sided gondola',
  'С наклонными полками': 'Tilted shelves',
  'Открытый 3×4': 'Open 3×4',
  'Комод-тумба': 'Sideboard',
  Витрина: 'Display cabinet',
  'Каркасный лофт': 'Loft steel frame',
  Гардероб: 'Wardrobe',
  'Куб 4×4': 'Cube 4×4',
  'Стол-надстройка': 'Desk with hutch',
  Пенал: 'Tall cabinet',
  // подсказки карточек
  'Классика: 12 открытых ячеек, фанера': 'A classic: 12 open cells, birch plywood',
  'Низкий, ящики + дверцы, столешница со свесом':
    'Low: drawers and doors, worktop with an overhang',
  'Высокая, стеклянные дверцы, подсветка полок': 'Tall, glass doors, lit shelves',
  'Стальной профиль + вкладные полки, связи жёсткости':
    'Steel profile with inset shelves and stiffening braces',
  'Штанга, антресоль, ящики': 'Hanging rail, overhead box, drawers',
  'Квадратные ячейки под коробы': 'Square cells sized for storage boxes',
  'Широкий пролёт-столешница с надстройкой': 'Wide worktop span with a hutch above',
  'Узкий и высокий, полностью закрытый': 'Narrow and tall, fully closed',
  // имена самих юнитов (сохраняются в проект)
  'Пристенный 1000': 'Wall bay 1000',
  'Пристенный 1250': 'Wall bay 1250',
  Островной: 'Gondola',
  Наклонный: 'Tilted bay',
  Комод: 'Sideboard',
  Каркасный: 'Steel frame',
  'Рабочее место': 'Workstation',

  // ── domain: подписи деталей (geometry.ts, bom.ts) ────────────────────────
  'Царга продольная': 'Long rail',
  'Царга поперечная': 'Cross rail',
  'Крышка вкладная': 'Inset top panel',
  'Полка вкладная': 'Inset shelf',
  'Связь жёсткости': 'Stiffening brace',
  'Полка торговая': 'Retail shelf',
  'Задняя стенка ячейки': 'Cell back panel',
  'Полка внутренняя': 'Inner shelf',
  'Перегородка внутренняя': 'Inner divider',
  'Фланец штанги': 'Rail flange',
  'Ножка-шпилька': 'Hairpin leg',
  'Площадка ножки': 'Leg mounting plate',
  Опора: 'Foot',

  // ── domain: инженерные предупреждения (geometry.ts, bom.ts) ──────────────
  'Полка {span} мм при толщине {thickness} мм прогнётся, добавьте перегородку':
    'A {span} mm shelf only {thickness} mm thick will sag — add a divider',
  'Стеклянная полка {span} мм — пролёт больше 700 мм, нужна опора':
    'Glass shelf {span} mm — spans over 700 mm need a support',
  'Высота {h} мм — закрепите к стене (антиопрокидыватель)':
    'Height {h} mm — anchor it to the wall (anti-tip)',
  'Глубина {d} мм — до задней стенки трудно дотянуться':
    'Depth {d} mm — the back panel is hard to reach',
  'Без задней стенки корпус потеряет жёсткость':
    'Without a back panel the carcass loses its rigidity',
  'Полка {shelf} мм глубже базы {base} мм — опрокинется':
    'A {shelf} mm shelf is deeper than the {base} mm base deck — the bay will tip over',
  'Толщина плиты {n} мм слишком мала для полок':
    'Board {n} mm thick is too thin for shelves',
  'Габарит {w}×{h} мм — разбейте на несколько секций':
    'Overall size {w}×{h} mm — split it into several bays',
  '«{name}»: тяжёлый — понадобится сборка на месте':
    '“{name}”: heavy — it will have to be assembled on site',

  // ── сцена: план, размеры, кубик ориентации ───────────────────────────────
  Право: 'RIGHT',
  Лево: 'LEFT',
  Верх: 'TOP',
  Низ: 'BOTTOM',
  Перёд: 'FRONT',
  Зад: 'BACK',
  'симметрично от центра': 'symmetrical about the centre',

  // ── экспорт: общие подписи таблиц ────────────────────────────────────────
  '№': '#',
  Деталь: 'Part',
  Ячеек: 'Cells',
  Фасады: 'Fronts',
  Детали: 'Parts',
  Цена: 'Price',
  Итоги: 'Totals',
  Помещение: 'Room',
  Стеллажей: 'Units',
  Раскладка: 'Layout',
  Поворот: 'Rotated',
  выход: 'yield',
  деталей: 'parts',
  стеллаж: 'shelving unit',
  стеллажей: 'shelving units',
  'Размер, мм': 'Size, mm',
  'Кол-во': 'Qty',
  'Площадь, м²': 'Area, m²',
  'Масса, кг': 'Weight, kg',
  'Кромка, м': 'Edging, m',
  'Толщина, мм': 'Thickness, mm',
  'Ширина, мм': 'Width, mm',
  'Высота, мм': 'Height, mm',
  'X, мм': 'X, mm',
  'Y, мм': 'Y, mm',
  'Ш × Г × В, мм': 'W × D × H, mm',
  'Цена, {cur}': 'Price, {cur}',
  'Сумма, {cur}': 'Amount, {cur}',
  'Материалы, {cur}': 'Materials, {cur}',
  'Кромление, {cur}': 'Edge banding, {cur}',
  'Фурнитура, {cur}': 'Hardware, {cur}',
  'ВСЕГО, {cur}': 'GRAND TOTAL, {cur}',
  ФУРНИТУРА: 'HARDWARE',
  'ПО МАТЕРИАЛАМ': 'BY MATERIAL',

  // ── экспорт CSV ──────────────────────────────────────────────────────────
  'Спецификация — {name}': 'Bill of materials — {name}',
  'Карта раскроя — {name}': 'Cutting plan — {name}',
  'Листов: {n}': 'Sheets: {n}',
  'Средний выход: {p} %': 'Average yield: {p}%',
  'НЕ РАЗМЕЩЕНО (деталь больше листа)': 'NOT PLACED (part larger than the sheet)',
  'спецификация.csv': 'bill-of-materials.csv',
  'раскрой.csv': 'cutting-plan.csv',

  // ── печатный бланк спецификации ──────────────────────────────────────────
  'Состав проекта': 'Project contents',
  'Итого по деталям': 'Parts subtotal',
  'Итого фурнитура': 'Hardware subtotal',
  'Сводка по материалам': 'Material summary',
  'Масса изделия': 'Product weight',
  'Всего по спецификации': 'Bill of materials total',
  'Замечания конструктора': 'Engineering notes',
  'Лист {n}': 'Sheet {n}',
  'повёрнута 90°': 'rotated 90°',
  'Не размещено': 'Not placed',
  // «Карта раскроя» — общий ключ, он задан в разделе тулбара ниже
  'Вид проекта': 'Project view',
  'Визуализация носит справочный характер; размеры и материалы — по таблицам ниже.':
    'The rendering is for reference only; dimensions and materials are given in the tables below.',
  'Проверьте документ и нажмите «Печать» — в диалоге выберите «Сохранить как PDF».':
    'Check the document and press Print — then choose “Save as PDF” in the dialog.',
  'Модульные стеллажи · конфигуратор': 'Modular shelving · configurator',
  'Спецификация изделия': 'Product bill of materials',
  'Сформировано в конфигураторе STANDES': 'Generated in the STANDES configurator',
  'спецификация.html': 'bill-of-materials.html',
  'Всплывающее окно заблокировано — спецификация сохранена файлом':
    'The pop-up was blocked — the bill of materials was saved as a file',
  'Не удалось собрать спецификацию': 'Could not build the bill of materials',

  // ── файлы проекта, ссылка, снимок, модель ────────────────────────────────
  'Файл не похож на проект STANDES': 'This file does not look like a STANDES project',
  'Импортированный проект': 'Imported project',
  'В проекте нет ни одного стеллажа': 'The project contains no shelving units',
  'Повреждённые данные стеллажа': 'Corrupted shelving unit data',
  'Файл не выбран': 'No file selected',
  'Не удалось прочитать файл': 'Could not read the file',
  'Ошибка чтения файла': 'File read error',
  'Проект по ссылке': 'Shared project',
  'Сцена ещё не готова — снимок сделать нечем':
    'The scene is not ready yet — there is nothing to capture',
  'Браузер не отдал изображение канваса': 'The browser did not return the canvas image',
  'Снимок сохранён: {w}×{h}': 'Screenshot saved: {w}×{h}',
  'Не удалось снять скриншот': 'Could not take the screenshot',
  'Сцена ещё не готова — нечего выгружать':
    'The scene is not ready yet — there is nothing to export',
  'В сцене нет ни одного стеллажа': 'There are no shelving units in the scene',
  'Модель выгружена: {file}': 'Model exported: {file}',
  'Не удалось экспортировать модель': 'Could not export the model',

  // ── клиентская витрина: оболочка, шапка, каталог, настройка, заявка ───────
  //    (src/ui/client/*: Shell, Topbar, Catalog, Configurator, Summary, LeadForm)
  Шапка: 'Top bar',
  'Настройка секции': 'Bay settings',
  'Поделиться ссылкой': 'Share a link',
  'Ссылка на проект скопирована': 'Project link copied',
  'Буфер обмена недоступен': 'Clipboard is not available',
  'Не удалось скопировать ссылку': 'Could not copy the link',

  // витрина готовых секций
  'Готовые секции': 'Ready-made bays',
  'Выберите секцию — она появится в зале. Размеры и цвет настроите дальше.':
    'Pick a bay and it lands on your sales floor. Size and colour come next.',
  'Каталог торговых секций пока пуст — загляните чуть позже.':
    'The bay catalogue is empty for now — please check back later.',
  'Добавлено: {name}': 'Added: {name}',

  // настройка секции
  'полок {n}': '{n} shelves',
  'Полки {d} мм': '{d} mm shelves',
  'высота {h} сохранится': 'height stays {h}',
  'держатели по переднему краю полок': 'rails along the front edge of every shelf',
  'товар лучше виден покупателю': 'goods face the shopper',
  'Добавлена такая же секция': 'Another identical bay added',
  'Секция удалена': 'Bay removed',
  'Эта секция настраивается в режиме менеджера — здесь только торговое оборудование.':
    'This unit is configured in manager mode — this view covers retail fixtures only.',
  'Открыть режим менеджера': 'Open manager mode',

  // итог заказа (счётчик секций склоняется через plural)
  Секция: 'Bay',

  // заявка покупателя
  'Заявка STANDES': 'STANDES quote request',
  'Секций: {n}': 'Bays: {n}',
  'Общая длина: {v}': 'Total length: {v}',
  'Полок всего: {n}': 'Shelves in total: {n}',
  'Ориентировочная стоимость: {sum}': 'Indicative price: {sum}',
  'Имя: {v}': 'Name: {v}',
  'Телефон: {v}': 'Phone: {v}',
  'E-mail: {v}': 'Email: {v}',
  'Комментарий: {v}': 'Comments: {v}',
  цвет: 'colour',
  ценники: 'price rails',
  'наклонные полки': 'tilted shelves',
  'Как к вам обращаться?': 'How should we address you?',
  Иван: 'John',
  'Нужен номер целиком — не меньше 10 цифр': 'Enter the full number — at least 10 digits',
  '+7 900 000-00-00': '+1 555 000-0000',
  'E-mail — если удобнее письмом': 'Email — if you prefer to write',
  'mail@example.ru': 'name@example.com',
  'Город, сроки, что планируете выкладывать': 'City, timeline, what you plan to merchandise',
  'Что отправляем: {n} секц. · {len} · {sum}': 'What we send: {n} bays · {len} · {sum}',
  'В заказе пока нет секций': 'No bays in the order yet',
  'Полок всего: {n} · цена ориентировочная': 'Shelves in total: {n} · price is indicative',
  'Бэкенд не подключён — заявка скопирована в буфер обмена и сохранена локально':
    'No backend is connected — the request has been copied to your clipboard and saved locally.',
  'Бэкенд не подключён — заявка сохранена локально, буфер обмена оказался недоступен':
    'No backend is connected — the request has been saved locally, but the clipboard was unavailable.',

  // ══ Каркас интерфейса менеджера ══════════════════════════════════════════
  //    (src/ui: Topbar, LeftPanel, UnitList, PresetGallery, StatusBar,
  //     Toasts, HelpOverlay, Shortcuts, ErrorBoundary)

  // ── подпись «действие — клавиша» в подсказках ────────────────────────────
  '{name} — {key}': '{name} — {key}',

  // ── ErrorBoundary ────────────────────────────────────────────────────────
  'Сбой: {area}': 'Failed: {area}',

  // ── Topbar: шапка проекта ────────────────────────────────────────────────
  'STANDES — навести камеру на выбор': 'STANDES — focus the camera on the selection',
  'Камера наведена на выбор': 'Camera focused on the selection',
  'Имя проекта': 'Project name',
  'Имя проекта — клик, чтобы переименовать': 'Project name — click to rename',

  // ── Topbar: привязки и ползунки вида ─────────────────────────────────────
  'Привязки включены': 'Snapping is on',
  'Привязки выключены': 'Snapping is off',
  'Шаг сетки, мм': 'Grid step, mm',
  'Шаг поворота': 'Rotation step',
  'Открыть двери и ящики — {p}': 'Open doors and drawers — {p}',
  'Разнести детали — {p}': 'Explode parts — {p}',

  // ── Topbar: история, документы, экспорт ──────────────────────────────────
  Отменить: 'Undo',
  Повторить: 'Redo',
  'Смета и стоимость': 'Bill of materials and cost',
  'Карта раскроя': 'Cutting plan',
  'Экспорт и сохранение': 'Export and save',
  Проект: 'Project',
  Модель: '3D model',
  'Качество рендера': 'Render quality',
  'Справка и горячие клавиши': 'Help and shortcuts',
  'Левая панель': 'Left panel',
  'Правая панель': 'Right panel',

  // ── Topbar: сообщения ────────────────────────────────────────────────────
  'Проект «{name}» загружен': 'Project “{name}” loaded',
  'Не удалось открыть файл': 'Could not open the file',
  'Нет ни одного видимого стеллажа': 'No visible units',
  'Не удалось выгрузить модель': 'Could not export the model',
  'Создан новый проект': 'New project created',

  // ── LeftPanel: счётчики подвала (склонение через plural) ─────────────────
  деталь: 'part',

  // ── UnitList ─────────────────────────────────────────────────────────────
  Перетащить: 'Drag to reorder',
  Показать: 'Show',
  Скрыть: 'Hide',
  Заблокировать: 'Lock',
  Разблокировать: 'Unlock',

  // ── PresetGallery ────────────────────────────────────────────────────────
  'Добавлен: {name}': 'Added: {name}',

  // ── StatusBar ────────────────────────────────────────────────────────────
  'Габарит: ширина × высота × глубина, мм': 'Overall size: width × height × depth, mm',
  'Позиция центра пятна застройки, мм': 'Footprint centre position, mm',
  'Деталей в проекте': 'Parts in the project',
  'дет.': 'parts',
  'Материалы, кромка и фурнитура': 'Materials, edge banding and hardware',
  ошибка: 'error',
  'Частота кадров сцены': 'Scene frame rate',
  fps: 'fps',

  // ── HelpOverlay: рамка окна ──────────────────────────────────────────────
  'Справка STANDES': 'STANDES help',
  'STANDES — как пользоваться': 'STANDES — how to use it',
  Мышь: 'Mouse',
  Клавиши: 'Keys',
  'Справка вызывается клавишей': 'This help opens with',

  // ── HelpOverlay: мышь (левая колонка узкая — держим подписи короткими) ───
  'ЛКМ по стеллажу': 'LMB on a unit',
  Выбрать: 'Select',
  Перетаскивание: 'Drag',
  'Двигать по полу': 'Move across the floor',
  'ЛКМ по ячейке': 'LMB on a cell',
  'Редактировать ячейку': 'Edit the cell',
  'ПКМ / средняя': 'RMB / middle',
  'Вращать и панорамировать камеру': 'Orbit and pan the camera',
  Колесо: 'Wheel',
  'Приблизить и отдалить': 'Zoom in and out',
  'Двойной клик': 'Double click',
  'Сфокусировать камеру': 'Focus the camera',

  // ── HelpOverlay: клавиши (колонка описаний узкая — без длинных фраз) ─────
  Вернуть: 'Redo',
  'Удалить выбранное': 'Delete selection',
  'Выбрать всё': 'Select all',
  'Снять выбор / закрыть': 'Deselect / close',
  'Привязки вкл/выкл': 'Snapping on/off',
  'Магниты вкл/выкл': 'Magnets on/off',
  'Сетка вкл/выкл': 'Grid on/off',
  'Привязка углов вкл/выкл': 'Angle snap on/off',
  'Привязка к стенам вкл/выкл': 'Wall snap on/off',
  'Контроль пересечений вкл/выкл': 'Overlap check on/off',
  'Повернуть на 90°': 'Rotate 90°',
  'Повернуть на −90°': 'Rotate −90°',
  'Сдвиг на шаг сетки': 'Nudge by grid step',
  'Сдвиг ×10': 'Nudge ×10',
  'Сдвиг на 1 мм': 'Nudge by 1 mm',
  'Вид: 3D / план / фасад': 'View: 3D / plan / front',
  'Смета внизу': 'Bill of materials',
  'Фокус камеры': 'Focus camera',
  'Эта справка': 'This help',
  'Сохранить в файл': 'Save to file',
  'Открыть файл': 'Open file',

  // ── HelpOverlay: магниты ─────────────────────────────────────────────────
  'Стеллажи прилипают друг к другу гранями и углами — бок к боку, спина к спине, угол к углу.':
    'Units snap to one another by faces and corners — side by side, back to back, corner to corner.',
  'Радиус срабатывания настраивается в панели привязок: чем он меньше, тем точнее нужно подвести.':
    'The snap radius is set in the snapping panel: the smaller it is, the closer you have to bring the unit.',
  'Зажатый Alt во время перетаскивания временно отключает все привязки — для ручной постановки.':
    'Holding Alt while dragging temporarily disables all snapping — for placing a unit by hand.',
  'Подсветка показывает будущий стык: синяя — примыкание к соседу, зелёная — к стене или сетке.':
    'The highlight previews the joint: blue means a neighbouring unit, green means a wall or the grid.',

  // ── Shortcuts: сообщения горячих клавиш ──────────────────────────────────
  'Выбранное заблокировано': 'The selection is locked',
  'Проект сохранён в файл': 'Project saved to file',
  'Не удалось сохранить файл': 'Could not save the file',
  'Открыт проект «{name}»': 'Opened project “{name}”',
  'Привязки выключены — включите их клавишей S': 'Snapping is off — press S to turn it on',
  'Магниты включены': 'Magnets on',
  'Магниты выключены': 'Magnets off',
  'Привязка к сетке включена': 'Grid snapping on',
  'Привязка к сетке выключена': 'Grid snapping off',
  'Привязка углов включена': 'Angle snapping on',
  'Привязка углов выключена': 'Angle snapping off',
  'Привязка к стенам включена': 'Wall snapping on',
  'Привязка к стенам выключена': 'Wall snapping off',
  'Контроль пересечений включён': 'Overlap check on',
  'Контроль пересечений выключен': 'Overlap check off',

  // ── инспектор + нижняя панель (каркас, ячейки, материалы, положение,
  //    комната, спецификация, раскрой, пикер материалов) ───────────────────

  // счётчики и единицы
  'м': 'm',
  'яч.': 'cells',
  '№ {n}': '#{n}',
  '{n} шт.': '{n} pcs',
  '{n} поз.': '{n} items',
  '{n} позиций': '{n} items',
  '{n} дет.': '{n} parts',
  'и ещё {n}': 'and {n} more',

  // каркас торгового стеллажа
  Перфорация: 'Perforation',
  Двусторонний: 'Double-sided',
  'Ширина перфорированной стойки, мм': 'Width of the perforated upright, mm',
  'Глубина нижней базы — она же пятно застройки':
    'Depth of the base deck — this is also the footprint of the bay',
  'Не больше глубины базы — иначе секция опрокинется':
    'No deeper than the base — otherwise the bay will tip over',
  'От пола до настила базы': 'From the floor to the base deck',
  'Передний край вниз — выкладка фруктов, хлеба, прессы':
    'Front edge down — for produce, bakery and press displays',
  'Высота бортика по переднему краю полки': 'Height of the lip along the shelf front edge',
  'Верхний фриз над секцией, 0 — без карниза': 'Top fascia above the bay; 0 means no header',
  'По переднему краю': 'Along the front edge',
  'Стенки и стойки': 'Back panel and uprights',
  'Островной, проход с двух сторон': 'Gondola — shoppable from both sides',
  'Для двустороннего глубина базы должна быть от': 'A gondola needs a base depth of at least',
  'Свес столешницы по бокам и вперёд': 'Worktop overhang at the sides and front',

  // ячейки
  Кисть: 'Brush',
  'Кликните ячейку на карте, чтобы настроить её. Shift + клик — объединить с выбранной.':
    'Click a cell on the map to configure it. Shift-click merges it with the selected one.',
  'ряд 1 — внизу': 'row 1 is at the bottom',
  'Ячейка — кол. {c}, ряд {r}': 'Cell — col. {c}, row {r}',
  Перегородок: 'Dividers',
  Ящиков: 'Drawers',
  Фрезеровка: 'Grooved',
  Петли: 'Hinges',
  Стиль: 'Style',
  'Вернуть общий материал': 'Back to the shared material',
  'Доступно при режиме «По ячейкам»': 'Available when the back panel is set to “Per cell”',
  Есть: 'Present',
  'Режим «По ячейкам»': '“Per cell” mode',
  'Объединение по колонкам': 'Merge across columns',
  'Объединение по рядам': 'Merge across rows',
  'Ко всему ряду': 'Apply to row',
  'Ко всей колонке': 'Apply to column',

  // материалы
  Акценты: 'Accents',
  'Готовые сочетания': 'Preset palettes',
  'Нет деталей': 'No parts',
  Скандинавия: 'Scandinavian',
  'Тёмный кабинет': 'Dark study',
  'Белый минимализм': 'White minimal',
  'Тёплый дуб': 'Warm oak',
  Графит: 'Graphite',

  // положение
  Сброс: 'Reset',
  Выравнивание: 'Alignment',
  'Выбрано: {n}': 'Selected: {n}',
  'Выберите два и более стеллажа': 'Select two or more units',
  'По левому краю': 'Align left',
  'По правому краю': 'Align right',
  'По переду': 'Align front',
  'По заду': 'Align back',
  'Разложить в ряд вплотную': 'Line up edge to edge',
  Свойства: 'Properties',
  Блокировка: 'Lock',
  Заблокирован: 'Locked',
  Свободен: 'Unlocked',
  Видимость: 'Visibility',
  Скрыт: 'Hidden',
  Виден: 'Visible',

  // комната
  'Быстрый размер': 'Quick size',
  'Показывать комнату': 'Show room',
  'Стены можно тянуть мышью в режиме «План».': 'Drag the walls with the mouse in Plan view.',

  // спецификация
  Сортировать: 'Sort',
  сортировать: 'sort',
  'Длина кромки, м': 'Edge banding length, m',
  'Цена за штуку': 'Price per unit',
  'Плоский список позиций': 'Flat list of items',
  'Группировать по материалам': 'Group by material',
  'Группировать по назначению деталей': 'Group by part function',
  'Фасады ящиков': 'Drawer fronts',
  'Царги ящиков': 'Drawer rails',
  'Дно ящиков': 'Drawer bottoms',
  Штанги: 'Hanging rails',
  Ручки: 'Handles',
  Стойки: 'Posts',
  Ригели: 'Beams',
  'Связи жёсткости': 'Bracing',
  Короба: 'Storage boxes',
  'Замечаний:': 'Notes:',
  'Экспорт не удался': 'Export failed',
  'Спецификация скопирована': 'Bill of materials copied',
  'Не удалось скопировать': 'Could not copy',
  'Не удалось рассчитать спецификацию': 'Could not calculate the bill of materials',
  'Сбросить сортировку': 'Clear sorting',
  'Нет деталей. Добавьте стеллаж — спецификация соберётся сама.':
    'No parts yet. Add a unit and the bill of materials builds itself.',

  // нижняя панель
  'Смета: детали, фурнитура, стоимость': 'Estimate: parts, hardware, cost',
  'Карта раскроя листов': 'Sheet cutting plan',
  'Высота нижней панели': 'Bottom panel height',
  'Закрыть панель': 'Close panel',
  'Ошибка расчёта': 'Calculation error',

  // раскрой
  'Учитывать направление волокон: детали из дерева и фанеры не разворачиваются на 90°':
    'Respect grain direction: wood and plywood parts are never rotated 90°',
  'Не помещается на лист:': 'Does not fit on a sheet:',
  'Не удалось рассчитать раскрой': 'Could not calculate the cutting plan',
  'Листовых деталей нет — раскраивать нечего.': 'No sheet parts — nothing to cut.',
  'Лист {n} из {m}': 'Sheet {n} of {m}',
  повёрнутые: 'rotated',
  'Отбортовка базы': 'Base front lip',

  'Торец базы': 'Base end panel',

  // ── зал в клиентском режиме ──────────────────────────────────────────────
  'Торговый зал': 'Sales floor',
  'Открыть план и тянуть стены': 'Open plan to drag walls',
  'Потяните стену мышью, чтобы изменить размер зала':
    'Drag a wall with the mouse to resize the floor',

  // ── штабелирование: секции друг на друге ─────────────────────────────────
  'Высота установки': 'Mounting height',
  'От пола до низа секции': 'From the floor to the bottom of the unit',
  'Высота установки: от пола до низа секции, мм':
    'Mounting height: floor to the bottom of the unit, mm',
  'низ {a} мм · верх {b} мм': 'bottom {a} mm · top {b} mm',
  'На пол': 'To floor',
  'Поставить друг на друга': 'Stack them',
  '«{top}» встанет на «{bottom}»': '“{top}” goes on top of “{bottom}”',
  'Ставить друг на друга': 'Stack on top',
  'выс. {v} мм': 'elev. {v} mm',
  Сверху: 'On top',
  'Сверху, в линию': 'On top, flush',
}
