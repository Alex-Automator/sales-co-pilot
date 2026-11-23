# VECTOR (Sales-co-pilot) — погоджена специфікація

Стан на 15.11.2026. Мова інтерфейсу: EN з перемиканням на UA. Дизайн: графіт і холодні сірі відтінки, один теракотовий акцент.

## 1. Загальне

- Веб-програма, працює в браузері. Код на GitHub, робота на Google Cloud / Firebase (окремий проєкт `sales-co-pilot`).
- Вхід через Google. Ролі: адмін і користувач. До 5 людей.
- Адмін видає й забирає доступ до окремих векторів; користувач бачить лише свої.
- Продаж B2B-сервісів. Ринки: Скандинавія, Європа, США, Канада, Австралія.
- Головні метрики: призначені зустрічі та підписані угоди.

## 2. Перший екран: вектор

- Чотири зони: Компанія → Напрямок → Аудиторія → Тема. У кожній можна додавати пункти.
- Компанія визначає скриньку й підпис: холодні листи з другорядного домену (.net), теплі з основного (.com).
- Біля кожного пункту два лічильники: листи клієнтів, що чекають відповіді; задачі на сьогодні та прострочені.
- Кнопка «Новий вектор»: 4 кроки.

## 3. Дошка-воронка

- Етапи: New → Contacted → Replied → Meeting → Proposal → Negotiation → Signed / Lost. Колір картки = етап.
- Перетягування, швидке додавання, пошук, фільтри за типом і «на сьогодні».
- Пізніше: доріжки, ліміти карток у колонці, гарячі клавіші, дії з кількома картками.

## 4. Картки

| Тип | Зміст |
|---|---|
| Кампанія | Google-таблиця з контактами, базовий лист, варіанти A/B/C, лічильники; породжує картки контактів, які відповіли |
| Компанія | Сайт, країна, телефон, LinkedIn, пов'язані контакти |
| Контакт | Ім'я, посада, компанія, email, телефон, LinkedIn, фото, історія листів |
| Задача | Вільна форма; клонується і перетворюється на інший тип |

- Фото: за замовчуванням логотип компанії; своє вставляється через Ctrl+V.
- На кожній картці: наступний крок, дата, нотатки.
- Автопілот (перемикачі): AI надсилає нагадування; AI відповідає на листи; чернетки на погодження; повідомити мене.

## 5. Листи та AI

- Ваш лист = варіант A; Claude і ChatGPT пропонують B і C; ви погоджуєте.
- Статистика за варіантами; найкращий іде в наступну партію. Система позначає, коли вибірка замала.
- «Рада AI»: Claude і ChatGPT обговорюють задачу з вами, 2–3 раунди з підсумком.
- Повна автоматизація можлива; оператор може ввімкнути «чернетки на погодження».
- Пошук клієнтів: імпорт Google-таблиці або запит до AI; на виході картки.
- LinkedIn: зберігаємо посилання; автоматичного збору немає. Платний сервіс даних (Apollo / Hunter) — пізніше за потреби.

## 6. Захист пошти

- Один Google Workspace на компанію; холодний домен усередині нього, окрема скринька (не псевдонім).
- Денний ліміт на скриньку з розгоном від 3–5 листів; випадкові паузи; відправка в робочі години одержувача.
- Щоденна перевірка: відмови доставки, обмеження Google, частка відповідей, SPF / DKIM / DMARC, чорні списки.
- Тривога зупиняє автопілот і надсилає повідомлення.
- Прогрів: стартуємо без сервісу; запасний варіант — Mailivery.

## 7. Аналітика

- Чотири цифри: зустрічі, угоди, частка відповідей, що чекає на вас сьогодні.
- Таблиця зусиль за обраною зоною (Компанія / Напрямок / Аудиторія / Тема).
- Результати варіантів листів; стан скриньок.

## 8. Database

| Вкладка | Зміст |
|---|---|
| Library | Маркетингові й сейлз-документи зі стабільними посиланнями та пріоритетами |
| Generator | Комерційна угода, рамковий договір, додаткова угода, інвойс-акт (для INDUSTRIT; ODDIN лишається на власних генераторах) |
| Documents | Реєстр згенерованих документів |
| Clients | База клієнтів із дзеркалом у Google Sheets |

Робочі дані живуть у базі Firebase; Google Sheets — імпорт і дзеркало бази клієнтів. Excel не використовуємо.

### Папки на Google Drive

```
Sales-Co-pilot/
├─ 00_Client-Base/        Clients_Master, Lead-Lists/
├─ 01_ODDIN/              Marketing-Sales/, Templates/, Clients/{клієнт}/
├─ 02_INDUSTRIT/          та сама структура
├─ 03_BidPlan-Partner/    та сама структура
└─ 99_System/             Documents_Register
```

У папці клієнта: Offers/, Contracts/, Addenda/, Invoices-Acts/.

### Структура таблиці контактів (20 колонок)

Контакт: First name, Last name, Job title, Seniority, Email, Email status, Direct phone, LinkedIn.
Компанія: Company, Website, Company LinkedIn, Company phone, Company type, Employees, Country, State, City.
Службові: Fit evidence, Source, Research date.

## 8a. Додано у версії 0.1

- Вектор продажів: визначені вектори вгорі екрана, нижче збирання нового з чотирьох параметрів. Вектор бачать автор і адмін.
- Налаштування параметрів: скриньки компанії (одна основна), критерії оцінки лідів 1–5 для напрямку, профіль аудиторії, гачок теми.
- Меню програми (лівий кут) і меню оператора (правий кут).
- Задача відрізняється від карток воронки: суцільний контур і куток, яким її позначають виконаною.
- Колір тіла картки з легенди, яку можна редагувати внизу дошки.
- Віджети (Analytics, Calendar, Important, Mailbox health), які можна міняти місцями.
- Генератор документів відокремлений від вкладок бази; документ готується з картки на етапі Proposal, Negotiation або Signed.
- AI-помічник: коротка інструкція на старті та відповіді щодо програми й статистики. Правило доступу: AI отримує дані лише тих векторів, до яких має доступ користувач; фільтрація робиться на сервері, а не в самому запиті до AI.

## 8b. Доступ до компаній і база клієнтів

- Доступ до кожної компанії адмін призначає окремо кожній людині: немає доступу, спільна база або власна база з нуля. Без доступу людина компанії не бачить; обмеження діє на сервері.
- Спільна база: людина бачить усі контакти й картки компаній цієї компанії з історією, з усіх векторів (Database → Clients). Задачі лишаються приватними.
- Власна база: людина бачить лише свої картки. Якщо вона вносить email, з яким уже працює інший менеджер у цій компанії, картка позначається «Не писати».
- Заборонені контакти: адмін задає кожній людині список email або доменів; такі контакти теж позначаються «Не писати». Коли з’явиться надсилання листів, програма відмовлятиме в надсиланні на них.
- Аудиторії й теми спільні для всіх. Напрямки належать компанії й успадковують її доступ.
- Скриньки: кожна належить тому, хто її додав; оператор бачить і обирає лише свої, адмін бачить усі.

## 8c. Одержувачі кампанії та листи

- Одержувачі живуть у кампанії, а не на дошці: список імпортується вставкою рядків із Google-таблиці або з CSV. Картка контакту на дошці з’являється, коли одержувача переводять у картку (пізніше автоматично, коли він відповів).
- Під час імпорту пропускаються дублікати й рядки без коректного email; кожен новий email перевіряється щодо інших менеджерів і списку заборонених.
- Листи: у кампанії та в картці контакту є ланцюжок. Типовий: 3 листи на день 0, 4 і 9 (робочі дні від першого листа). У кожного листа тема, текст зі змінними ({{firstName}}, {{company}} …), перегляд на реальному одержувачі та статус: чернетка, перевірено AI, затверджено.
- Надсилається лише затверджене. Будь-яка правка затвердженого листа повертає його в чернетку.
- Ланцюжок зупиняється, якщо клієнт відповів, лист не доставлено або контакт позначено «Не писати».
- Ще не підключено: чернетка й перевірка від AI (етап 3), надсилання та читання відповідей (етап 4).

## 8d. Ролі та підписи

- Суперадмін: той, хто увійшов першим. Він один, його роль не може змінити ніхто; лише він призначає й знімає адмінів, видаляє користувачів і бачить усе.
- Адмін: підтверджує нових людей як операторів, веде списки заборонених контактів. Бачить усе (вектори, картки разом із задачами, одержувачів, скриньки) лише в компаніях, де суперадмін призначив його керівником, і там же роздає операторам доступ.
- Оператор: бачить власну роботу і те, до чого йому надали доступ.
- Обмеження діють у правилах бази, а не лише на екрані.
- Підписи: у кожної скриньки свій підпис. Він сам додається в кінець листа, якщо в тексті немає змінної {{signature}}. Для холодних скриньок пропонується простий текстовий підпис.

## 9. Етапи

| Етап | Зміст | Стан |
|---|---|---|
| 1 | Інтерфейс на тестових даних: вектор, дошка, картки, аналітика, бібліотека, EN/UA | зроблено (ревізія 1) |
| 2 | Вхід через Google, спільна база, ролі й доступ до векторів | зроблено, чекає першого входу на справжньому Firebase |
| 3 | Google Sheets, Gmail, захист пошти, папки Drive | |
| 4 | Claude і ChatGPT: пошук, листи, A/B/C, рада AI, автопілот | |
| 5 | Генератори документів для INDUSTRIT | |

## 10. Листи: бриф, варіанти, правила надсилання (додано 16.11.2026)

- **Бриф для AI** живе в налаштуваннях Теми (4-й параметр): гачок, пропозиція, тон (позначки), заклик наприкінці, доказ, чого не писати, зразок стилю. Усі поля необов'язкові й мають підказки.
- **Варіанти A, B, C** у кампанії це різні листи, що йдуть паралельно. Розподіл отримувачів: рівними частками (щоб порівняти) або за посадою (кожному варіанту задаються слова з назв посад; хто не збігся, отримує A). Кожен варіант має власний ланцюжок: A1, далі нагадування A2, A3 (до п'яти), які йдуть лише поки клієнт мовчить і які AI пише як продовження першого листа. Для кожного листа обирається пара: Claude пише, ChatGPT перевіряє (типово для A); навпаки (типово для B); або текст пише оператор і за бажанням просить Claude чи ChatGPT доопрацювати (типово для C). Порожня тема нагадування означає відповідь у тій самій гілці.
- **Мова надсилання** обирається в кампанії, типово англійська. Тексти пишуться й затверджуються англійською, переклад показується на затвердження перед надсиланням.
- **Рядок відмови та реквізити** вмикаються окремо для кожної скриньки й додаються під підписом.
- **Правила надсилання** (меню налаштувань, змінює лише суперадмін): повзунок із п'яти рівнів від «Обережно» (3 листи на день, +2 щотижня, до 10) до «На межі» (10, +10, до 40). Числа можна змінити вручну, але не вище рівня «На межі». Окремо: години отримувача, робочі дні, нерівні паузи, холодні листи лише з другорядних скриньок, без відстеження відкриттів. Не вимикаються: затвердження перед надсиланням, зупинка на відповідь, зупинка на недоставлену адресу, заборонені контакти.

## 11. Створення голосом і з фото (побажання від 16.11.2026, після підключення AI)

Мета: у розмові з AI-помічником сказати або написати завдання, додати фото візитівок і отримати готову чернетку вектора й кампанії.

1. Користувач у панелі AI-помічника диктує або пише завдання і додає одне чи кілька фото візитівок. Приклад: «Кампанія за візитівками з виставки FinnBuild, варіанти A і B, ланцюжок із двох листів, стандартний інтервал, гачок: спілкувалися на виставці про симуляції будівельних процесів».
2. Claude читає візитівки (ім'я, посада, компанія, пошта, телефон, сайт) і розбирає завдання.
3. Відкривається чернетка вектора: чотири параметри заповнені з наявних або запропоновані нові; те, що AI не зміг визначити, підсвічено як «потрібно дозаповнити». Користувач виправляє і натискає «Створити вектор».
4. У векторі вже лежить картка кампанії (назва на кшталт «FinnBuild outreach») з отримувачами з візитівок, листом A1 від Claude, листом B1 від ChatGPT і другими листами ланцюжка A2 та B2. Гачок із завдання записується в бриф.
5. Перевірка доречності: контакти, які не стосуються напряму (наприклад, випадкова візитівка не з будівництва), AI пропонує виключити з поясненням; виключає лише після згоди користувача.
6. Користувач переглядає, коментує («коротше», «прибери ціну»), AI переписує. Команда «вперед» затверджує й ставить перший лист у чергу; далі діють правила надсилання.

Обмеження: нічого не створюється і не надсилається без підтвердження; діють права доступу, заборонені контакти й перевірка «контакт уже веде інший менеджер».

## 12. Ревізія 2 (план)

- **Пряме з'єднання Claude з VECTOR (надважливо).** Окремий чат у застосунку Claude підключається до програми як конектор і сам створює чернетки векторів, кампаній і листів голосом та з фото, без копіювання. Потребує серверної частини, входу й перевірки прав доступу. Повернутися до цього одразу після запуску надсилання листів.
- До того часу автостворення вектора й карток (розділ 11) працює через панель AI-помічника в браузері; на iPhone голос вводиться мікрофоном клавіатури.

## 13. AI і база лідів, AI і бібліотека (додано 18.11.2026)

- **Перевірка сайтів.** У кампанії, вкладка «Отримувачі»: користувач вписує слова для пошуку (наприклад, `data center, data centre, mission critical`) і запускає перевірку. Сервер відкриває власний сайт кожної компанії (головну й до чотирьох сторінок про проєкти чи ринки), шукає ці слова і, якщо вони є, просить Claude Haiku підтвердити, що йдеться про роботи самої компанії, та назвати проєкт. Результат для кожного отримувача: знайдено (з назвою проєкту, якщо вона є), не знайдено, немає сайту, сайт не відкрився. Одна компанія перевіряється один раз для всіх її контактів.
- **Вилучення.** AI лише пропонує: кнопка «Вилучити тих, у кого не знайдено» прибирає їх із розсилки після згоди користувача; будь-кого можна повернути.
- **Поле `{{project}}`.** Назва знайденого проєкту доступна в листі. Фраза в подвійних квадратних дужках `[[ … {{project}} … ]]` лишається тільки для тих отримувачів, у кого назва є.
- **Бібліотека.** Матеріали з розділу Database → Library (назва й посилання) для компанії вектора потрапляють у бриф; AI може дати в листі одне посилання з цього списку.
- Обмеження: соцмережі (LinkedIn, Facebook) не читаються; сайти, які будуються скриптами або блокують роботів, можуть дати «не знайдено» чи «не відкрився».

## 14. Ревізія 0.2: кампанія з чотирьох кроків (19.11.2026)

Картка кампанії веде кроками: **1 Джерело → 2 Отримувачі → 3 Листи → 4 Надсилання**. Кроки позначаються галочкою, коли готові; переходити між ними можна вільно.

1. **Джерело.** Таблиця контактів (вставка або CSV) або пошук компаній через AI: Claude шукає в інтернеті компанії за описом, сервер відкриває їхні сайти й збирає вказані там адреси. Компанія без адреси додається з порожнім полем, адресу можна вписати в таблиці.
2. **Отримувачі.** Критерій відбору AI бере з брифу Теми (одне твердження про компанію, тег і слова для пошуку); користувач підтверджує або виправляє. Перевірка компанії: власний сайт → якщо сайт не дав відповіді, пошук в інтернеті через Claude → перед позначкою «Ні» незалежний пошук через ChatGPT. Підсумок: «Підходить» (з доказом, джерелом і назвою проєкту), «Ні» (обидва пошуки нічого не знайшли), «Не певен» (думки розійшлися або перевірка не вдалася). «Не певен» лишаються в розсилці, доки користувач не вирішить. Вилучає лише користувач: кожного окремо або всіх «Ні» однією кнопкою.
3. **Теги.** Тим, хто підходить, ставиться тег (наприклад `#data-center`). Теги видно в таблиці отримувачів і в Database → Clients, де за ними можна фільтрувати; там тепер показані й контакти з кампаній. Результат перевірки компанії за тим самим критерієм повторно використовується в інших кампаніях.
4. **Листи.** Кнопка «Підготувати всі листи через AI»: A1 пише Claude, B1 пише ChatGPT, плюс по одному нагадуванню. Під кожним листом поле коментаря: AI переписує лист за коментарем.
5. **Надсилання.** Скринька, чинні правила надсилання, перелік готовності й кнопка «Почати кампанію» (стане активною після підключення пошти). Після запуску: рух списком за правилами; відповідь зупиняє ланцюжок і створює дочірню картку контакту з позначкою кампанії.

Картка контакту, створена з кампанії, показує «З кампанії: …» і успадковує теги.

## 15. Рядок відмови (19.11.2026)

**Рядок відмови та реквізити** налаштовуються у векторі (три крапки біля вектора): вимикач і текст. Це типове значення для всіх карток вектора. Картка кампанії на кроці «Надсилання» має власний вимикач. Зі скриньок це налаштування прибрано; у скриньки лишився тільки підпис.

## 16. HTML-підпис і скорочений імпорт (19.11.2026)

- **HTML-підпис.** У скриньки, крім простого підпису, є необов'язкове поле «HTML-підпис із логотипом» з попереднім переглядом. Якщо воно заповнене, лист іде у двох версіях: текстовій (з простим підписом) і HTML (з HTML-підписом). Картинки, вставлені в підпис як `data:`, сервер перетворює на вкладені зображення, бо Gmail не показує `data:`-картинки. Скрипти й обробники подій із підпису вирізаються.
- **Скорочений імпорт.** У кроці «Джерело» можна вставити по одній людині в рядку: ім'я та адреса в будь-якому порядку, без рядка заголовків.
- **Сайт із адреси.** Якщо адреса корпоративна (не Gmail, Outlook, ukr.net тощо) і сайт не вказано, сайтом компанії стає домен адреси. Діє для обох способів імпорту.

## 17. Критерій відбору живе в Темі (19.11.2026)

Критерій («що має бути правдою про компанію»), тег і слова для пошуку задаються в налаштуваннях Теми (параметр 4) як типові для всіх кампаній вектора з цією темою; там же кнопка «Запропонувати через AI», яка виводить їх із брифу. Картка кампанії на кроці «Отримувачі» показує ці значення і дозволяє змінити їх лише для себе; посилання «Повернути критерій із теми» скасовує власну версію. Автоматичного звернення до AI при відкритті кроку більше немає.

## 18. Запуск кампанії (19.11.2026)

Кнопка «Почати кампанію» на кроці «Надсилання» активна, коли є отримувачі з адресою, затверджено всі листи всіх варіантів і обрано скриньку. Вона просить підтвердити другим натисканням, бо йдуть справжні листи.

- **Черга.** Сервер складає для кожного отримувача готові листи (з підставленими полями) і ставить людей у чергу. Повторний запуск додає лише тих, кому ще не писали: перший лист двічі нікому не піде.
- **Правила надсилання** беруться з налаштувань у момент надсилання: денний ліміт нових листів на скриньку з щотижневим розгоном, пауза між листами, робочі дні, години (за часовим поясом того, хто запустив). Правило «холодні лише з другорядних скриньок» перевіряється під час запуску. Правила «не більше N людей з однієї компанії на день» і «пауза при частці недоставлених» ще не діють.
- **Розклад.** Раз на дві хвилини сервер перевіряє гілки й дає кожній скриньці надіслати щонайбільше один лист: спершу нагадування, яким настав час, потім наступна людина з черги.
- **Інтервали** між листами ланцюжка рахуються в днях, годинах або хвилинах (вибір на кроці «Листи»); відлік іде від фактичного часу попереднього листа.
- **Відповідь** зупиняє ланцюжок і створює картку контакту в колонці Replied з позначкою кампанії. Повернення листа позначається «Не доставлено». Після останнього листа гілка ще перевіряється: 6 годин для хвилинних інтервалів, 3 дні для годинних, 21 день для денних.
- **Нагадування** йдуть у ту саму гілку (In-Reply-To, References), тема «Re: …», якщо власну не задано.
- **Хід кампанії** видно на кроці «Надсилання»: лічильники, стан скриньки на сьогодні, таблиця по отримувачах, кнопка «Зупинити кампанію».
- Перед постановкою в чергу сервер перевіряє, що справді може надсилати з обраної скриньки.

## 19. Statistics and journal (agreed 20 Nov 2026, not built yet)

Step 1 of the "sales director" plan (statistics and journal → adviser inside VECTOR → Claude connector).

**Statistics in the campaign card** (step "Sending", collapsed by default, opens on demand): sent / delivered /
bounced; replies and reply share of delivered; which letter was answered (first, reminder 1, reminder 2);
variants A / B / C side by side; a "too little data" mark while a variant has fewer than about 30 letters.

**Statistics page** (Widgets), with period and company filters: by vector parameter (company, direction, audience,
topic), by recipient job title, by criterion result (yes / unsure), by mailbox (sent per day against the cap,
bounce share), by weekday and hour.

**Funnel after a reply**: how many campaign contacts reached each board stage and the average days per step.
Deal amounts are not needed for now.

**Not counted**: opens and clicks (tracking hurts delivery), spam placement (cannot be seen).

**Reply quality**: four categories: Interested, Not now, No, Auto-reply. AI reads the reply and proposes the
category, the person can change it. An auto-reply does not stop the chain and does not create a card.

**Who sees what**: an operator sees only their own companies, vectors and cards; an admin sees the company and
everything operators and the admin opened under it; the super admin sees everything.

**Journal** (a tab in Database). The program records facts itself (campaign start, letter change, topic hook
change, sending rules change) with the numbers before. At the check date AI compares the numbers and writes the
conclusion and what to do next. The person confirms it, or disagrees and leaves a comment, and AI rewrites the
conclusion with that comment. The goal is a system that runs as independently as possible, with the person approving.

## 20. Answering from a contact card (20 Nov 2026)

A contact card that came from a campaign reply (or already has a conversation) shows, on its Letters tab, the
letters exchanged with the person and an answer field. AI (Claude or ChatGPT) drafts the answer from the
conversation and the topic brief, or asks up to three questions when it lacks something. "Send the answer" needs
two presses and sends at once, from the same mailbox, in the same thread, with the mailbox signature. Only the
mailbox owner (or the super admin) can read and answer. After the answer the server watches for the person's next
letter for 30 days and raises "Reply waiting" on the card. Server function: `convo` (read / draft / send).

Replies are detected in every thread of the chain and by a mailbox search for letters from the recipient.
Every letter carries an HTML version. A start is refused when a letter uses a field that is empty for a recipient.

Agreed, not built yet: a Company card works one target company with several people — personal letters per person,
AI studies the company's site, no A/B/C variants, a reply from one person pauses letters to the others, and the
card itself moves along the board as the deal.

## 21. Sending: what the server guarantees (tested 20 Nov 2026 on a simulated mailbox)

- Replies are looked for every 10 minutes for everyone with a letter out (hourly after three days), also after a
  campaign is stopped (for three weeks).
- Before each letter: the campaign card must exist (otherwise the run stops), the person must still be on the list
  and not left out, and the address must not be on the starter's forbidden list.
- One address gets one chain inside a campaign. The start reports how many were skipped as forbidden or repeated.
- An attempt cut off in the middle is never repeated blindly: the server looks into the Sent folder and records
  what is true.
- Working hours are the recipient's. The time zone is estimated from country and state, then the country ending of
  the email or website, then the phone code; a country with several zones gets its middle one unless the state is
  known; nothing known -> the starter's zone (marked * in the table).
- No more than N new letters a day to one client company (same email domain; free mail services are not a company).
  N is "per company" in the sending rules; the card says how many people wait for tomorrow.
- When at least 2 addresses bounced and their share is over the limit in the sending rules, the campaign pauses,
  the card gets a "Needs attention" badge and a warning; "Continue the campaign" resumes it.
- An automatic answer (out of office) gets a card that asks for attention like any reply, but it is marked
  (`kind: auto`, tag `auto-reply`) and must not be counted in reply statistics.
- Letters edited after the start apply only to people added later; the Letters step says so.
- Decided not to do: skipping people already written to from another campaign.

## 22. Bridge to Claude (Revision 2), part 1 built 22 Nov 2026

Goal: the person talks to Claude in Claude's own chat (also by voice and from the phone); Claude acts in VECTOR as a
sales and marketing director with the person's rights. Nothing is launched without the person's explicit "Поїхали".

Built (part 1, read only): an MCP server (`functions/bridge.js`, function `bridge`, Streamable HTTP, tools only,
works with the 2025 handshake and the stateless 2026-07-28 revision) and a personal key (`bridgeKey`, super admin
only for now). Tools: vector_overview, get_parameter, get_vector, get_card, list_recipients, campaign_status,
get_conversation, find. Signatures and keys are never returned. Every call is logged.

Agreed next:
- Part 2: create and set up everything a person can click before a launch: direction, audience, topic (hook, offer,
  criterion), vector, cards (contact, company, campaign, task), recipients, criterion check, letters, mailbox choice.
  Claude asks when data is missing, agrees the topic hook with the person, reviews and corrects letters drafted
  inside VECTOR. Never: sending rules, access rights, forbidden list, mailboxes, deleting.
- Part 3: the first letter from a contact card (one person, same sending rules) and launch tools that Claude calls
  only after "Поїхали"; these tools stay on "ask every time" in Claude; a daily limit of launches through the bridge.
- Later: admins and operators connect their own Claude with their own rights; statistics and journal; a scheduled
  weekly review.

Part 2 built 22 Nov 2026 (preparing, no launch): get_library, create_parameter, update_parameter (direction, audience,
topic; never a company), create_vector, create_card, update_card (also mailbox, opt-out line, campaign criterion),
add_recipients, update_recipient, set_letters. Checks on the server: forbidden list, repeated addresses, mailbox
ownership, letter fields, a contact card per email per board. Letters are saved as drafts unless the person approved
the exact text. Every write is logged with what was asked (`bridgelog`). Still to build in part 2b: drafting a letter
and checking recipients against the criterion with VECTOR's own AI from the chat. Part 3: first letter from a contact
card and launch after "Поїхали".

Part 3 built 23 Nov 2026. A contact card sends its own chain (one person, variant A, the same sending rules): button
"Send the chain" on the Letters tab, or through the bridge. A reply moves the same card to Replied and raises "Reply
waiting"; no second card. Bridge tools: find_correspondence and read_correspondence (the person's own mailboxes),
launch_check (what would go out and what stops it), start_sending and send_answer (both need the person's go-ahead
words; marked as irreversible so that Claude asks permission), stop_sending. A launch through the bridge runs the same
server function as the button, with the same checks, at most 20 a day. The server cannot see the chat: the guarantee
of "only after Поїхали" is the permission prompt in Claude ("Always ask" on the two sending tools) plus Claude's
instructions; every launch is logged with the quoted words.
Still open: part 2b (drafting and criterion check by VECTOR's own AI from the chat), operators' own keys, statistics
and journal, company card, weekly review.
