# חשבוניות – סריקת חשבוניות ואישור מנהל

אפליקציית ווב ארגונית: עובד מצלם או מעלה חשבונית, המערכת מחלצת ממנה נתונים בעזרת Claude API, העובד בודק ושולח לאישור, המנהל מאשר או דוחה, והנהלת החשבונות מייצאת את מה שאושר.

## הנחיות עבודה ל-Claude
- המשתמש אינו מפתח מנוסה. בכל שלב יש להסביר בעברית פשוטה מה נעשה, ומה עליו לעשות בעצמו (פתיחת חשבונות, מפתחות, הגדרות), צעד אחר צעד.
- בונים שלב אחד בכל פעם ומריצים אותו מקומית לפני שממשיכים לשלב הבא.
- בסוף כל שלב: סיכום של מה נבנה, הוראות בדיקה ו-commit ל-git.
- סודות לא נכנסים לקוד ולא ל-git. הם נשמרים רק ב-`.env.local` ובמשתני הסביבה של Vercel.
- ממשק בעברית מלאה, `dir="rtl"`, מותאם קודם כול לנייד.

## טכנולוגיות
- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth, Storage (פרויקט בענן, כי Docker אינו מותקן ולכן אין Supabase מקומי)
- Anthropic Claude API, מודל Sonnet העדכני (`claude-sonnet-5-5`), ונקרא רק בצד השרת
- zod לאימות, ספריית xlsx/exceljs לייצוא, ספריית sharp לכיווץ תמונות
- פריסה ב-Vercel, ו-PWA (manifest ואייקונים)
- סביבה מקומית: Windows 11, Node 22, git

## תפקידים והרשאות
| תפקיד | מה רואה ועושה |
|---|---|
| עובד (`employee`) | מגיש חשבוניות ורואה רק את החשבוניות שלו |
| מנהל (`manager`) | רואה, מאשר ודוחה חשבוניות של העובדים הישירים שלו, ובאישור נוסף גם של עובדי המנהלים שתחתיו |
| הנהלת חשבונות (`accounting`) | רואה את כל החשבוניות המאושרות והמשולמות, מייצאת ומסמנת "שולם" |
| אדמין (`admin`) | מנהל משתמשים, תפקידים, מחלקות וקטגוריות |

- כל ההרשאות נאכפות ב-Row Level Security, ולא רק בממשק.
- התחברות: בשלב ראשון מייל וקוד חד-פעמי (OTP). בהמשך Microsoft או Google של הארגון.

## מודל נתונים (טיוטה)
- `departments`: id, name
- `categories`: id, name, active
- `profiles`: id (= auth.users.id), full_name, email, role, department_id, manager_id, active
- `invoices`: id, employee_id, status, file_path, file_mime,
  supplier_name, supplier_tax_id, doc_type (`tax_invoice` | `tax_invoice_receipt` | `receipt`),
  invoice_number, invoice_date, allocation_number, amount_before_vat, vat_amount, total_amount, currency,
  category_id, department_id, project, notes, extraction_raw (jsonb), rejection_reason,
  submitted_at, decided_at, decided_by, paid_at, created_at, updated_at
  - אינדקס ייחודי חלקי על (supplier_tax_id, invoice_number) לזיהוי כפילויות, וגם בדיקה רכה בממשק
- `invoice_items`: id, invoice_id, description, quantity, amount
- `invoice_history`: id, invoice_id, actor_id, from_status, to_status, note, changes (jsonb), created_at, ונכתבת ב-trigger
- `currencies`: code (ILS/USD/EUR…), name, rate_to_ils (שער ידני שהאדמין מעדכן), updated_at
- `settings`: key/value, למשל `second_approval_threshold_ils` (ברירת מחדל 5000)
- ב-`invoices` נוספים: `total_ils` (מחושב לפי השער בעת ההגשה), `first_approver_id`, `first_approved_at`, `current_approver_id` (מי צריך לאשר עכשיו)
- Storage: bucket פרטי `invoices`, נתיב `{user_id}/{invoice_id}.{ext}`, קישורים חתומים לזמן קצר

## סטטוסים
`draft` טיוטה → `pending` ממתין לאישור → [`pending_second` ממתין לאישור נוסף] → `approved` אושר / `rejected` נדחה (סיבה חובה) → `paid` שולם
- **מנהל**: לכל עובד יש מנהל ישיר (`profiles.manager_id`). מי שמאשר הוא המנהל הישיר של המגיש, גם כשהמגיש הוא בעצמו מנהל.
- **אישור נוסף**: אם `total_ils` גבוה מהסף שבהגדרות, אחרי אישור המנהל הישיר החשבונית עוברת ל-`pending_second` אצל המנהל של המנהל. אם אין לו מנהל, אישור אחד מספיק. דחייה בכל אחד מהשלבים מחזירה ל-`rejected`.
- **מטבע זר**: מומר לשקלים לפי השער הידני בטבלת `currencies`, רק לצורך השוואה לסף ולדוחות.
- חשבונית שנדחתה: העובד יכול לערוך ולהגיש מחדש (`rejected` → `pending`).
- כל מעבר נרשם ב-`invoice_history`: מי, מתי ומה השתנה.
- המעברים נאכפים בצד השרת ובמסד הנתונים, ולא רק בממשק.

## חילוץ נתונים
- Route Handler או Server Action בלבד. `ANTHROPIC_API_KEY` לעולם לא מגיע לדפדפן.
- PDF נשלח ישירות כבלוק `document`. תמונה מכווצת (צלע ארוכה עד כ-1600px, JPEG) ונשלחת כבלוק `image`.
- המודל מתבקש להחזיר JSON בלבד, שמאומת עם zod. שדה שלא נמצא מקבל `null`.
- בממשק: סימון שדות חסרים, ואזהרה כשסכום לפני מע"מ ועוד מע"מ שונה מהסה"כ (סטייה מעבר ל-0.01).
- כפילות: אותו ספק (ח.פ, או שם אם אין ח.פ) עם אותו מספר חשבונית שכבר הוגש מקבל אזהרה. ההגשה עצמה נחסמת.
- בדיקת קובץ: JPEG, PNG, HEIC/WebP ו-PDF בלבד, עד 10MB.

## מסכים
1. `/login`: התחברות
2. `/invoices/new`: צילום או העלאה, ואז עריכת השדות לצד תמונת החשבונית
3. `/invoices`: החשבוניות שלי עם סטטוס
4. `/approvals`: אישורים למנהל, עם סינון לפי סטטוס, תאריך וסכום
5. `/accounting`: ייצוא CSV/Excel וסימון "שולם"
6. `/admin`: משתמשים, תפקידים, מחלקות וקטגוריות

## משתני סביבה (`.env.local`, לא עולה ל-git; תבנית ב-`.env.example`)
```
NEXT_PUBLIC_SUPABASE_URL=              # https://zcfvwibujznsmtdiosbn.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # sb_publishable_...
SUPABASE_SECRET_KEY=                   # sb_secret_...  שרת בלבד
SUPABASE_DB_URL=                       # Session pooler, למיגרציות בלבד
ANTHROPIC_API_KEY=                     # שרת בלבד (נדרש משלב ג')
SEED_EMAIL=                            # בסיס לכתובות משתמשי הדמו (+admin, +employee…)
APP_URL=http://localhost:3000
```
- המשתמשת ממלאת סודות ישירות בקובץ, לא בצ'אט. לבדוק ערכים רק לפי צורה ואורך, בלי להדפיס אותם.

## פקודות
- `npm run dev`: שרת פיתוח
- `npm run db:push`: החלת מיגרציות מ-`supabase/migrations` על פרויקט הענן (דרך `SUPABASE_DB_URL`)
- `npm run db:seed`: נתוני דמה (אפשר להריץ שוב)
- `npm run db:test`: בדיקות RLS ותהליך האישור מול מסד הנתונים האמיתי, בתור כל משתמש דמו

## מבנה
- `src/proxy.ts`: רענון session והפניה ל-`/login` (רק נוחות; ההרשאות האמיתיות ב-`requireUser/requireRole` וב-RLS)
- `src/lib/auth.ts`: `requireUser()` / `requireRole(...)` בראש כל דף ו-server action. משתמש מושבת מנותב ל-`/auth/signout`
- `src/app/(app)/`: כל המסכים המוגנים; `admin/actions.ts` עם server actions לניהול. השבתת משתמש = `active=false` + ban ב-Auth
- טפסים: `ActionForm` (useActionState) + server action שמחזירה `ActionResult`
- התחברות: עד שיוגדר SMTP (שלב ה') Supabase שולח רק את תבנית ברירת המחדל עם קישור Sign in, ולכן `/auth/callback` מחליף את ה-code ל-session (צריך לפתוח את הקישור באותו דפדפן). הפרוקסי מעביר `/?code=` לשם. אחרי SMTP: תבנית עם `{{ .Token }}` לקוד. השרת המקומי רץ על פורט 3000 (= Site URL). ה-OTP: `shouldCreateUser: false` (רק משתמשים שאדמין הוסיף). בפיתוח יש כפתורי כניסה מהירה למשתמשי דמו (`NODE_ENV=development` בלבד)
- Cache Components כבויים (`next.config.ts`): כל המסכים תלויי משתמש
- העלאה: הדפדפן מכווץ תמונה (עד 2000px JPEG) ומעלה ישירות ל-Storage (`{uid}/{uuid}.ext`); `processUpload` בשרת מוריד, בודק סוג אמיתי לפי bytes וגודל, שולח ל-Claude ויוצר טיוטה
- `src/lib/extract.ts`: `claude-sonnet-5-5`, `client.beta.messages.parse` + `betaZodOutputFormat` (JSON מאומת, שדה שלא נמצא = null), `fallbacks: "default"`. PDF נשלח כ-document, תמונה מוקטנת ל-1600px עם sharp
- אישורים: `/approvals` (ממתינות לי / אישרתי / דחיתי / כל הצוות + סינון תאריך וסכום בשקלים). ההחלטה עצמה בדף החשבונית (`DecisionPanel`, מוצג רק ל-`current_approver_id`), דרך `approve_invoice` / `reject_invoice`
- היסטוריה: `invoice_history` (נכתבת ב-trigger) מוצגת בדף החשבונית. עובד יכול לצרף/להחליף קובץ בטיוטה או בחשבונית שנדחתה (`replaceFile`)
- מילוי אוטומטי: Claude מציע קטגוריה מתוך הרשימה הפעילה; כשמופיעים 2 מתוך 3 סכומים השלישי מחושב. `extraction_raw.derived` / `category_suggested` מסמנים בעורך שדות "✨ חושב" / "✨ הוצעה"
- מחלקות וקטגוריות ממוינות לפי `position` ואז שם ("אחר" = 999, תמיד אחרון)
- `samples/`: חשבוניות לדוגמה (PNG/PDF) לבדיקה ידנית
- אחרי מיגרציה חדשה: `npm run db:types` מעדכן את `src/lib/database.types.ts`
- `supabase/migrations/`: סכמה, פונקציות תהליך (`submit_invoice`, `approve_invoice`, `reject_invoice`, `mark_invoices_paid`, `invoice_duplicate_exists`), RLS ו-Storage. שינוי סכמה = קובץ מיגרציה חדש, לא עריכה של קובץ שכבר הוחל.
- סטטוס משתנה רק דרך פונקציות התהליך. למשתמשים יש הרשאת עדכון רק לעמודות שניתנות לעריכה.
- `src/lib/supabase/`: `server.ts` (משתמש מחובר), `client.ts` (דפדפן), `admin.ts` (מפתח סודי, שרת בלבד)
- Next.js 16 עם `cacheComponents`: קריאות לנתונים לא מטומנים עטופות ב-`<Suspense>` (ראו `node_modules/next/dist/docs`)

## תוכנית עבודה
- [x] **א. הקמה**: פרויקט Next.js, git, חיבור ל-Supabase, מיגרציות SQL (טבלאות, RLS, triggers, bucket), seed עם משתמש מכל תפקיד
- [x] **ב. התחברות ותפקידים**: OTP במייל, middleware, ניווט לפי תפקיד, מסך אדמין (משתמשים ומנהלים, מחלקות, קטגוריות, מטבעות, סף אישור)
- [x] **ג. העלאה וחילוץ**: צילום או העלאה, כיווץ, Claude API, zod, טופס עריכה, אזהרות וכפילויות
- [x] **ד. אישור והיסטוריה**: מסך אישורים, אישור או דחייה עם סיבה, הגשה מחדש, ציר היסטוריה
- [ ] **ה. ייצוא והתראות**: CSV/Excel, סימון שולם, מיילים למנהל ולעובד
- [ ] **ו. פריסה**: Vercel, משתני סביבה, כתובות Auth ב-Supabase, PWA

## נתוני דמה
משתמש אחד מכל תפקיד, ועוד מנהלת בכירה לאישור הנוסף (כתובות `+alias` של `SEED_EMAIL`, כדי שקוד ה-OTP יגיע). היררכיה: עובדת → משה מנהל → דנה בכירה; חשבונות → דנה בכירה, שתי מחלקות, כמה קטגוריות וכמה חשבוניות בסטטוסים שונים.

## החלטות שהתקבלו
- מנהל ישיר לכל עובד, ונקבע על ידי האדמין
- אישור נוסף מעל סף שניתן לשינוי (ברירת מחדל 5,000 ₪ כולל מע"מ), על ידי המנהל של המנהל
- מטבע זר: שער ידני שהאדמין מתחזק
- מיילים: Resend
- חשבונות קיימים: GitHub. צריך לפתוח Supabase,‏ Anthropic Console ו-Vercel (Vercel רק בשלב ו')
