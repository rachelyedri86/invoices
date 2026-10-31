# בדיקות

שלוש רמות של בדיקות, מהמהירה לאיטית. רק הראשונה לא צריכה מסד נתונים.

| רמה | פקודה | מה בודקת | צריך |
|---|---|---|---|
| יחידה | `npm test` | פונקציות טהורות: זיהוי סוג קובץ, תאריכים וסכומים (כולל השלמת הסכום החסר), CSV ומניעת נוסחאות, מסנני הנהלת החשבונות, קודי האזהרה, `absoluteUrl`, מוק החילוץ, לקוח GitHub | כלום |
| אינטגרציה | `npm run test:integration` (או `npm run db:test`) | הרשאות (RLS) ותהליך האישור מול Supabase אמיתי, בתור כל משתמש דמו | פרויקט Supabase עם ה-seed |
| קצה לקצה | `npm run test:e2e` | דפדפן אמיתי: עובדת סורקת חשבוניות מסוגים שונים, מנהל מאשר (ואישור נוסף מעל הסף), הנהלת חשבונות מייצאת ומסמנת שולם | פרויקט Supabase עם ה-seed |
| קצה לקצה עם Claude | `npm run test:e2e:real` | אותם תרחישים, אבל הקבצים נשלחים באמת ל-Claude (בתשלום, כעשר קריאות להרצה) | גם `ANTHROPIC_API_KEY` |

## איפה רצים: פרויקט Supabase נפרד לבדיקות (מומלץ)

בדיקות האינטגרציה והקצה לקצה רצות מול פרויקט ה-Supabase שמשתני הסביבה מצביעים עליו. הן פועלות רק בתור משתמשי הדמו, מסמנות כל חשבונית שהן יוצרות בשם ספק שמתחיל ב-`TEST-<מזהה ההרצה>` ומוחקות אותה בסוף. בכל זאת, פרויקט נפרד לבדיקות בטוח יותר:

1. ב-Supabase: **New project** (אפשר בחינם), למשל `invoices-test`.
2. בתיקיית הפרויקט יוצרים קובץ `.env.test` (לא עולה ל-git) עם הערכים של פרויקט הבדיקות:
   ```
   SUPABASE_URL=https://xxxxxxxx.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   SUPABASE_DB_URL=postgresql://...   # Connect → Session pooler
   SEED_EMAIL=you@gmail.com
   SEED_CONFIRM=yes
   ```
3. מחילים את המיגרציות ויוצרים את משתמשי הדמו בפרויקט הבדיקות:
   ```bash
   node --env-file=.env.test scripts/db-push.mjs
   ```
   ```bash
   node --env-file=.env.test scripts/seed.mjs
   ```
4. ב-Authentication של פרויקט הבדיקות מכבים את "Allow new users to sign up", כמו בייצור (בדיקת "הרשמה עצמית חסומה" מצפה לזה).

הבדיקות לוקחות את ההגדרות לפי הסדר הזה: משתנים שכבר מוגדרים (ב-CI), הקובץ שב-`ENV_FILE`, `.env.test`, ואם אין, `.env.local`. בתחילת כל הרצה מודפסת כתובת הפרויקט שנבדק. אם `SEED_EMAIL` לא מוגדר, או שמשתמשי הדמו לא קיימים (או שהתפקידים ומבנה המנהלים שלהם שונים מה-seed), הבדיקות מסרבות להתחיל ולא כותבות כלום.

## בדיקות הקצה לקצה

- Playwright מפעיל בעצמו `next dev` על פורט **3100** (לא 3000, כדי שלא ישתמש בטעות בשרת פיתוח שכבר רץ עם חילוץ אמיתי). אם Next.js מתלונן ששרת פיתוח אחר רץ באותה תיקייה, עוצרים את `npm run dev` קודם.
- הכניסה היא בכפתורי הכניסה המהירה של משתמשי הדמו (קיימים רק ב-`NODE_ENV=development`), כך שאין צורך במייל.
- בפעם הראשונה צריך להתקין את הדפדפן: `npx playwright install chromium`.
- הדוח נשמר ב-`playwright-report/` (פותחים עם `npx playwright show-report`).

התרחישים (`tests/e2e/invoices.spec.ts`): חשבונית מס, חשבונית מס/קבלה (הסכום לפני מע״מ מחושב), קבלה בלבד, חשבונית בדולרים מעל הסף (אישור נוסף של המנהלת הבכירה), חשבונית בלי סה״כ (הסה״כ מחושב), מטבע לא מוכר (GBP, אזהרה), PDF באירו, תמונה שאינה חשבונית (אזהרה ומחיקת הטיוטה), והגשה כפולה (אותה חשבונית כתמונה ואז כ-PDF נחסמת). בכל תרחיש של חשבונית: העלאה, בדיקת השדות במסך הבדיקה, הגשה, אישור, ייצוא CSV ו-Excel וסימון "שולם".

### חילוץ מדומה (mock)

בבדיקות אין קריאות ל-Claude: עם `EXTRACTION_PROVIDER=mock` (ורק כש-`NODE_ENV` אינו production, או עם `ALLOW_EXTRACTION_MOCK=1` במפורש) `extractInvoice` מחזיר את התשובה השמורה לקובץ מתוך `tests/fixtures/extractions.json`. הקובץ מזוהה לפי SHA-256, ותמונה גם לפי "חתימה" גסה של התמונה, כי הדפדפן מכווץ כל תמונה מחדש ל-JPEG לפני ההעלאה ולכן הבייטים שמגיעים לשרת שונים מהקובץ המקורי. קובץ לא מוכר נחשב "לא חשבונית".

חשבוניות הבדיקה (כולן בדויות) נוצרות עם `npm run fixtures:generate` (`tests/fixtures/generate.mjs`) ונשמרות ב-git יחד עם ה-hash שלהן. להוספת תרחיש: מוסיפים רשומה ב-`generate.mjs` (איך הקובץ נראה ומה צריך לחלץ ממנו), מריצים את הפקודה, מוסיפים תרחיש ב-`invoices.spec.ts` ומבצעים commit לכל הקבצים שהשתנו. `npm test` נכשל אם קובץ השתנה בלי שה-JSON עודכן.

## GitHub Actions

`.github/workflows/ci.yml` רץ בכל push ו-pull request ל-main שמשנים קוד (`src`, `supabase`, `scripts`, `tests`, `package*.json`, `next.config.ts`, `Dockerfile`, ה-workflow עצמו), ואפשר להפעיל אותו ידנית (Actions → CI → Run workflow) עם בחירת חבילה:

| חבילה | מתי | מה רץ |
|---|---|---|
| `quick` | pull request | lint, build, בדיקת טיפוסים, בדיקות יחידה |
| `full` | push ל-main, הפעלה ידנית, כפתור האדמין | quick + אינטגרציה + קצה לקצה עם חילוץ מדומה |
| `real-extraction` | הפעלה ידנית (או לילית, אם מפעילים את ה-`schedule` שבקובץ) | כמו full, אבל עם Claude אמיתי |

אינטגרציה וקצה לקצה רצים רק אם הוגדרו ה-Secrets של פרויקט הבדיקות. מגדירים אותם ב-GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret ב-GitHub | הופך בזמן ההרצה ל- | מה זה |
|---|---|---|
| `TEST_SUPABASE_URL` | `SUPABASE_URL` | כתובת פרויקט הבדיקות |
| `TEST_SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_PUBLISHABLE_KEY` | המפתח הציבורי של פרויקט הבדיקות |
| `TEST_SUPABASE_SECRET_KEY` | `SUPABASE_SECRET_KEY` | המפתח הסודי של פרויקט הבדיקות |
| `TEST_SEED_EMAIL` | `SEED_EMAIL` | כתובת הבסיס של משתמשי הדמו בפרויקט הבדיקות |
| `TEST_ANTHROPIC_API_KEY` (רשות) | `ANTHROPIC_API_KEY` | רק לחבילה `real-extraction`; בלעדיו התרחישים האלה מדולגים |

הקידומת `TEST_` מזכירה שאלה מפתחות של פרויקט הבדיקות, לא של הייצור. קובץ ה-workflow עצמו לא מכיל סודות. דוח Playwright של כל הרצה נשמר כ-artifact בשם `playwright-report`.

## מסך האדמין: ניהול → בדיקות (`/admin/tests`)

**בדיקה מהירה** מריצה את בדיקות ההרשאות ותהליך האישור (אותו קוד כמו `npm run db:test`, מתוך `src/lib/selftest/checks.ts`) בתוך השרת, מול מסד הנתונים של הסביבה שבה היא רצה. היא פועלת רק בתור משתמשי הדמו, יוצרת חשבוניות בדיקה מסומנות ומוחקת אותן, מחזירה את משתמשי הדמו למצבם (בזמן הבדיקה המנהל הדמו מושבת לרגע), לא שולחת מיילים, לא פונה ל-Claude, ומוגבלת לדקה. התוצאה נשמרת בטבלת `settings` (מפתח `last_selftest`) ומוצגת בטבלה.
- היא דורשת `SEED_EMAIL` בשרת ומשתמשי דמו קיימים במסד שלו. בסביבת הייצור זה אומר שמשתמשי הדמו (כולל "אדמין דמו") קיימים גם בייצור; זו החלטה של בעלת המערכת. בלי `SEED_EMAIL` הכפתור מסביר מה חסר ולא מריץ כלום.

**הרצת הבדיקות המלאות** מפעילה את ה-workflow ב-GitHub עם `suite=full` ומציגה את 10 ההרצות האחרונות עם סטטוס וקישור. Playwright אף פעם לא רץ בתוך השרת (128MB זיכרון). להפעלה צריך:

1. **טוקן fine-grained**: ב-GitHub, **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - **Resource owner**: בעלת הריפו (`rachelyedri86`). טוקן fine-grained ניגש רק לריפו של מי שיצר אותו (או של ארגון), ולכן משתף פעולה לא יכול ליצור אותו לריפו של חשבון אחר.
   - **Repository access**: Only select repositories → `invoices`.
   - **Permissions → Repository permissions → Actions: Read and write** (Metadata: Read-only נוסף לבד). שום הרשאה אחרת.
   - תוקף: למשל 90 יום, ולחדש כשהוא פג (המסך יציג "הטוקן לא תקין או שפג תוקפו").
2. **ב-xhostd**: להוסיף את `GITHUB_TOKEN` כסוד (בקונסול, לא בצ'אט), ואם הריפו אינו `rachelyedri86/invoices` גם `GITHUB_REPO=owner/repo` כמשתנה רגיל. אחר כך deploy.
3. קובץ ה-workflow צריך להיות ב-main (ההפעלה תמיד על main).
