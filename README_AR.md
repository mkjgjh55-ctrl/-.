# LIBERTY CITY Discord Bot

بوت ديسكورد مبدئي باسم LIBERTY CITY، يعمل بـ Node.js و Discord.js v14.

## الموجود حالياً
- `/panel` إرسال لوحة تذاكر بزر فتح تذكرة.
- `/ticket-setup` تحديد قسم التذاكر.
- `/close` إغلاق التذكرة.
- `/embed` إرسال إمبد بعنوان ونص وصورة اختيارية.
- `/autoreply-add` إضافة رد تلقائي حسب كلمة.
- `/welcome-setup` تعيين روم الترحيب (وللاستمرار بعد إعادة التشغيل ضع المعرف في `.env`).
- `/kick` و`/ban` للإدارة.
- `/play` تشغيل رابط صوتي مدعوم، و`/stop` إيقافه.
- حماية أولية من الرسائل السريعة جداً (حذف فقط دون عقوبة تلقائية).

## تشغيله
1. أنشئ تطبيقاً وبوتاً من https://discord.com/developers/applications
2. فعّل Server Members Intent و Message Content Intent من صفحة Bot.
3. ادعُ البوت إلى سيرفرك مع صلاحيات Manage Channels و Manage Messages و Kick Members و Ban Members و Send Messages و Embed Links و Connect و Speak و Use Application Commands.
4. انسخ `.env.example` إلى ملف اسمه `.env` واملأ القيم.
5. على جهاز/استضافة فيها Node.js 20 أو أحدث شغّل:
   - `npm install`
   - `npm start`
6. بعد الاتصال، أوامر السلاش تُسجل تلقائياً في السيرفر المحدد.

## مهم للأمان
- لا ترسل `DISCORD_TOKEN` لأي شخص ولا تضعه في صورة أو رسالة.
- إذا ظهر التوكن للغير، اعمل Reset Token فوراً من Developer Portal.
- لا تعطي البوت Administrator إذا لم تكن محتاجاً؛ استخدم أقل الصلاحيات اللازمة.
- هذا إصدار بداية يحتاج اختباراً على سيرفر تجريبي قبل الاعتماد عليه.
- حماية السبام هنا أولية وليست نظام Anti-Nuke كاملاً.
- تشغيل الموسيقى يعتمد على دعم الرابط من play-dl وقد يتغير حسب مزود الخدمة.
- الاستضافة المجانية قد تنام أو تتوقف؛ لا يوجد ضمان 24/7 لمدة سنة على خطة مجانية.
