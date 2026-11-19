# Розгортання серверної частини VECTOR

Серверна частина лежить у папці `functions/` і запускається в Cloud Functions for Firebase (регіон europe-west1). Функції:

- `ai`: написати, доопрацювати, переписати за коментарем або перевірити лист;
- `criterion`: вивести з брифу Теми критерій відбору компаній;
- `research`: перевірити компанію за критерієм (сайт, пошук через Claude, пошук через ChatGPT);
- `find`: знайти компанії в інтернеті за описом і зібрати адреси з їхніх сайтів.

Пошук в інтернеті використовує вбудовані інструменти Claude (`web_search_20250305`) і OpenAI (`web_search`). Якщо в Claude Console вебпошук вимкнено для організації, його треба ввімкнути в налаштуваннях.

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

## Пошта (Gmail)

Функція `mailTest` надсилає один тестовий лист зі скриньки компанії на адресу входу того, хто її викликав. Сервер не має ключа службового акаунта `vector-mailer`: він просить Google підписати короткочасний запит від імені цього акаунта, а Google Workspace приймає його завдяки domain-wide delegation.

Разове налаштування в Cloud Shell:

```
gcloud services enable iamcredentials.googleapis.com gmail.googleapis.com --project vector-sales-co-pilot
gcloud iam service-accounts add-iam-policy-binding vector-mailer@vector-sales-co-pilot.iam.gserviceaccount.com --member="serviceAccount:943187389377-compute@developer.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator" --project vector-sales-co-pilot
```

Функції запуску: `campaignStart`, `campaignStatus`, `campaignStop` і `tick` (за розкладом кожні дві хвилини: надсилає те, що настав час надіслати, і шукає відповіді). Черга листів лежить у колекції `sends`; з браузера вона недоступна.
