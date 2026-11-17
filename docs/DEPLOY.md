# Розгортання серверної частини VECTOR

Серверна частина лежить у папці `functions/`. Вона запускається в Cloud Functions for Firebase (регіон europe-west1) і робить одне: за запитом програми просить Claude або ChatGPT написати, доопрацювати чи перевірити лист.

Ключі AI зберігаються в Secret Manager проєкту `vector-sales-co-pilot` під назвами `ANTHROPIC_API_KEY` і `OPENAI_API_KEY`. У репозиторії та в браузері їх немає.

## Перше розгортання (у браузері, через Google Cloud Shell)

1. Відкрити https://shell.cloud.google.com під акаунтом, якому належить проєкт Firebase.
2. Виконати по черзі:

```
git clone https://github.com/Alex-Automator/sales-co-pilot.git
cd sales-co-pilot
(cd functions && npm install)
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only functions
```

Після кожної команди `secrets:set` вставити відповідний ключ і натиснути Enter (символи не показуються).

## Оновлення після змін у коді

```
cd sales-co-pilot
git pull
(cd functions && npm install)
firebase deploy --only functions
```

## Зміна моделей

Назви моделей записані на початку файлу `functions/lib.js` (`MODELS`). Після зміни потрібне оновлення, як вище.

## Обмеження

- Працюють лише користувачі зі схваленим доступом і лише для векторів, до яких вони мають доступ.
- Не більше 150 звернень до AI на людину за добу (`LIMITS.perUserPerDay`).
