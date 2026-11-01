# Подача в Chrome Web Store: чек-лист

Для Алекса. Подаёшь со своего аккаунта разработчика, всё для вставки уже в репозитории. Правила сверены 1 ноября 2026 по документации Chrome Web Store (ссылки в конце). В сам кабинет разработчика я не входил: подписи полей могут слегка отличаться.

## Что где лежит

| Что | Где |
|---|---|
| Архив для загрузки | `dist/duetta-chat-export.zip` версии 1.1.0, с экраном согласия (собрать: `./scripts/package.sh`), или тот же файл из релиза v1.1.0 на GitHub. Версию 1.0.0 в стор не подавать: в ней нет экрана согласия |
| Тексты карточки и ответы на вкладку Privacy | [`listing.md`](listing.md): блоки копировать как есть |
| Иконка 128×128 | [`../extension/icons/128.png`](../extension/icons/128.png) |
| Скриншоты 1280×800, 5 шт. | [`screenshots/`](screenshots/), по порядку номеров |
| Плитка 440×280 | [`promo-tile-440x280.png`](promo-tile-440x280.png) |
| Политика приватности | [`../PRIVACY.md`](../PRIVACY.md), ссылка для формы: `https://github.com/Duetta-ai/character-ai-chat-export/blob/main/PRIVACY.md` |

## 1. Аккаунт разработчика ($5, один раз)

1. **Выбери Google-аккаунт.** Почту аккаунта разработчика потом поменять нельзя. Лучше рабочий аккаунт Duetta, а не личный.
2. **Включи двухэтапную проверку (2-Step Verification)** в этом Google-аккаунте. Без неё нельзя ни опубликовать, ни обновить расширение.
3. **Открой https://chrome.google.com/webstore/devconsole.** Прими соглашение разработчика и правила, заплати регистрационный сбор $5 (разовый, картой). С осени 2026 регистрация принимается только из стран из списка на странице регистрации: если страны там нет, зарегистрироваться не выйдет.
4. **Вкладка Account:**
   - **Publisher name** виден в карточке как «Offered by». Предлагаю `Duetta`.
   - **Contact email** виден в контактах расширения. Его нужно подтвердить: придёт письмо.
   - Физический адрес нужен только тем, кто что-то продаёт. Нам не нужен.
5. **Trader / Non-trader** (обязательный вопрос, закон ЕС DSA). Google за тебя не решает.
   - **Trader**, если публикуешь для бизнеса: Duetta — продукт компании, поэтому, скорее всего, этот вариант. Это моё прочтение, не юридический совет.
     - Юридическое имя, адрес, телефон и email трейдера публикуются внизу карточки для пользователей из ЕС.
     - Телефон подтверждается по SMS, нужен профиль Google Payments. Это бесплатно.
     - Указывай адрес и телефон компании, которые не жалко показать.
   - **Non-trader**: только если это не для бизнеса. Тогда пользователям в ЕС пишут, что на них не распространяются права потребителя.
6. Новому разработчику доступно не больше двух опубликованных расширений. Нам хватит.

## 2. Загрузить архив

1. **Собери архив** командой `./scripts/package.sh`. Версия 1.1.0, `manifest.json` лежит в корне zip, как требует стор.
2. **В кабинете нажми «New item»** и загрузи `dist/duetta-chat-export.zip`.
3. **Название и короткое описание берутся из `manifest.json`.** В кабинете их не исправить.
   - Чтобы их поменять, нужен новый zip с большей версией.
   - Сейчас название 18 знаков (лимит 75), описание 108 знаков (лимит 132).

## 3. Вкладка Store listing

| Поле | Что вставить |
|---|---|
| Description | блок «Description» из `listing.md`. Абзац «WHAT IT READS AND WHERE IT GOES» не убирай: это раскрытие данных, которое требуют правила |
| Category | **Tools** (группа Productivity) |
| Language | English |
| Store icon | `extension/icons/128.png` |
| Screenshots | 5 файлов из `store/screenshots/` по порядку |
| Small promo tile | `store/promo-tile-440x280.png`. Необязательна, но расширения без неё показываются после тех, у кого она есть |
| Marquee, YouTube video | пропустить |
| Official URL | пропустить: нужен сайт, подтверждённый в Search Console |
| Homepage URL / Support URL | из `listing.md` (GitHub и его Issues) |

## 4. Вкладка Privacy

| Вопрос | Ответ |
|---|---|
| Single purpose | блок из `listing.md` |
| Permission justification: `activeTab`, `scripting`, `storage` | три блока из `listing.md`, каждый в своё поле |
| Are you using remote code? | **No, I am not using remote code** |
| Data usage: какие данные | отметить **Personally identifiable information**, **Personal communications**, **Website content**. Остальные (health, financial, authentication, location, web history, user activity) не отмечать |
| Три подтверждения (certify) | отметить **все три** |
| Privacy policy URL | `https://github.com/Duetta-ai/character-ai-chat-export/blob/main/PRIVACY.md` |

**Почему не «ничего не собирается».** С июля 2026 правила требуют раскрывать данные, даже если они только обрабатываются на компьютере пользователя и никуда не уходят (User Data FAQ, вопрос 3).

| Пункт | Что расширение делает | Почему галочка |
|---|---|---|
| Website content | читает со страницы текст карточки и чата | это текст страницы |
| Personal communications | читает переписку | это сообщения |
| Personally identifiable information | сравнивает ник автора персонажа с ником аккаунта | FAQ относит username к PII |

Ник никуда не сохраняется. Если отметить меньше, чем написано в политике приватности, это повод для отказа. Ответы этой формы показываются в карточке публично, рядом с тремя подтверждениями.

## 5. Вкладка Distribution

- **Visibility:**
  - Public — расширение видно всем в сторе.
  - Unlisted — тихий запуск: открывается только по ссылке, проверка та же.
- **Regions:** все.
- **Цена:** бесплатно, платежей нет.

## 6. Вкладка Test instructions (необязательна, но лучше заполнить)

Вставь блок из `listing.md`. Расширение работает только с персонажем, которого создал вошедший аккаунт, поэтому ревьюеру нужен свой персонаж на character.ai. Можно дать ревьюеру тестовый аккаунт с логином и паролем: это твоё решение, я никаких аккаунтов не заводил.

## 7. Отправка

1. **Нажми «Submit for review».** В окне отправки есть галочка автоматической публикации после проверки. Если её снять, после одобрения будет 30 дней, чтобы нажать «Publish» вручную.
2. **Сроки.** Обычно проверка занимает несколько дней, но может растянуться на недели: новый разработчик и новое расширение проверяются дольше. Если прошло больше трёх недель, пиши в поддержку.
3. **Отзыв отправки.** Отправку на проверку можно отозвать, до шести раз в день.

## 8. Если откажут

В письме будет названо нарушенное правило и его код: цвет и элемент, например Purple Nickel. Ниже коды, которые вероятнее всего для нас, и что делать по каждому. Отказ можно обжаловать один раз (кнопка Appeal в кабинете) или исправить и отправить заново.

| Код | О чём | Что делать |
|---|---|---|
| Purple Nickel | раскрытие данных и согласие пользователя | ответить, что с версии 1.1.0 при первом клике попап показывает, что читается, и ничего не читает до «Agree and continue» (скриншот 5); подробности ниже |
| Purple Lithium | политика приватности и ответы о данных | проверить, что галочки совпадают с `PRIVACY.md` |
| Purple Potassium | лишние права | объяснить по текстам из `listing.md`: прав и так минимум, host permissions нет |
| Yellow Zinc | описание и метаданные | например, если сочтут, что упоминание Character.AI вводит в заблуждение: дисклеймер уже есть; при необходимости убрать бренд из короткого описания (это manifest, значит новая версия) |

**Согласие внутри расширения (закрыто в 1.1.0).** Правило Disclosure Requirements требует показать пользователю, какие данные читаются, и получить его явное согласие. Документы Google расходятся в том, где это делать:

| Документ | Что говорит |
|---|---|
| Troubleshooting | раскрытия в карточке стора достаточно |
| User Data FAQ, вопрос 10 | раскрытие должно быть в интерфейсе самого расширения, с явным действием пользователя |

Сделано и то и другое:
- в описании карточки есть абзац «WHAT IT READS AND WHERE IT GOES»;
- при первом клике попап показывает экран «What this extension reads»: что читается и куда идёт, ссылка на политику и кнопка «Agree and continue». До нажатия кнопки расширение не трогает ни одну вкладку, это проверяет тест;
- согласие запоминается одним флагом в `chrome.storage.local`, поэтому экран показывается один раз.

## 9. После публикации

- **Ссылка в README.** Добавить в начало README ссылку на стор как основной способ установки, а zip из релизов оставить запасным. Скажи, я сделаю.
- **Обновление.** Поднять версию (как в разделе Release в README) → `./scripts/package.sh` → в кабинете Package → Upload new package → Submit for review. Если меняется то, что расширение читает, нужно поправить экран согласия и поднять `CONSENT` в `extension/popup.js`: тогда пользователей спросят заново, как требует Disclosure Requirements.
- **Кто ставил из zip.** Такие пользователи сами в стор не переедут: им нужно удалить распакованную версию и поставить из стора.

## Сверка с правилами

| Правило | Где | Как выполняем | Риск |
|---|---|---|---|
| Одна понятная цель (single purpose) | Program Policies | одна функция: сохранить своего персонажа и чат в файл | низкий |
| Минимум прав | Program Policies | только `activeTab`, `scripting`, `storage`; host permissions нет | низкий |
| Без удалённого кода | Program Policies (MV3) | весь код в пакете, CSP `script-src 'self'`, `connect-src 'none'` | низкий |
| Раскрывать данные, даже локальные | User Data FAQ, вопрос 3 | три галочки, политика, абзац в описании | низкий |
| Политика приватности | User Data FAQ, вопросы 6 и 14 | `PRIVACY.md` | низкий |
| Заявление о Limited Use | Program Policies, Limited Use | есть в `PRIVACY.md` | низкий |
| Только необходимые данные (с июля 2026) | Limited Use, блог 2026 | читается только то, что нужно для файла; ник сверяется и не сохраняется | низкий |
| Безопасное хранение (шифрование при передаче и хранении) | User Data FAQ, вопрос 9 | ничего не передаётся; `storage.session` живёт в памяти, в `storage.local` только флаг согласия; файл — это экспорт, о котором просит сам пользователь, в README и попапе сказано, что JSON не зашифрован | низкий-средний |
| Раскрытие и согласие | Disclosure Requirements; FAQ, вопрос 10; Troubleshooting | абзац в карточке и разовый экран согласия в попапе до любого чтения (с 1.1.0) | низкий |
| Чужой бренд и выдача себя за другого | Program Policies, Impersonation | бренда нет в названии и иконке, формулировка «Compatible with», дисклеймер «not affiliated» | низкий-средний |
| Спам ключевыми словами | Spam FAQ | Character.AI упомянут несколько раз, по делу | низкий |
| Обман в описании и скриншотах | Program Policies | скриншоты — настоящее расширение на тестовых страницах с выдуманным персонажем | низкий |
| Доступ к контенту без разрешения; обход ограничений ИИ-сервисов (с июля 2026) | Program Policies; блог 2026 | читает только то, что владелец персонажа и так видит на своей странице, ничего не обходит | низкий |
| 2-Step Verification, Trader | правила аккаунта | см. раздел 1 | — |

Не проверено:
- живой кабинет разработчика (я не входил);
- точный способ оплаты $5;
- условия использования Character.AI (можно ли автоматизировать прокрутку своей истории): это отдельный юридический вопрос.

Источники:
- [Регистрация](https://developer.chrome.com/docs/webstore/register)
- [Настройка аккаунта](https://developer.chrome.com/docs/webstore/set-up-account)
- [2-Step Verification](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)
- [Trader FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq)
- [Подготовка пакета](https://developer.chrome.com/docs/webstore/prepare)
- [Store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Картинки](https://developer.chrome.com/docs/webstore/images)
- [Privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)
- [Изменения правил 2026](https://developer.chrome.com/blog/cws-policy-updates-2026)
- [Troubleshooting (коды отказов)](https://developer.chrome.com/docs/webstore/troubleshooting)
- [Публикация](https://developer.chrome.com/docs/webstore/publish)
- [Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Проверка](https://developer.chrome.com/docs/webstore/review-process)
