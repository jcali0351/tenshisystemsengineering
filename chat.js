/* Tanaka Matsumoto, the AI assistant (chat.css for the look).
   - Without CHAT.endpoint, Tanaka answers from the site's own text in translations.js (services, contact, location,
     languages), in the visitor's language (English, Japanese, Korean or German).
   - With CHAT.endpoint set to the Cloudflare Worker in tools/chat-worker/, Tanaka answers with Claude, fed the site's
     service descriptions. The Claude API key lives only in the Worker, never in this file.
   - "Talk to a person" opens the visitor's email app with their message (and the chat, if they want) to CONTACT_EMAIL (app.js).
   Tanaka says plainly that he is an AI. Loaded on every page after translations.js and app.js. */
(function () {
  "use strict";

  var CHAT = {
    // The address of the Worker in tools/chat-worker/, e.g. "https://tenshi-chat.yourname.workers.dev". Empty: local answers only.
    endpoint: ""
  };

  // Where the site's files are, so links work from the homepage and from services/*.html.
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.getAttribute("src") || "chat.js";
    return s.replace(/chat\.js.*$/, "");
  })();
  var EMAIL = typeof CONTACT_EMAIL === "string" ? CONTACT_EMAIL : "";
  var T = window.TRANSLATIONS || {};
  var SERVICES = [
    ["software", "software-development"], ["consulting", "technology-consulting"], ["media", "media-design"],
    ["webdesign", "web-design"], ["webdev", "web-development"], ["hosting", "hosting"],
    ["ai", "ai-services"], ["cms", "content-management"], ["branding", "branding"]
  ];

  /* ---------- the chat's own words, in each language ---------- */
  var UI = {
    en: {
      launch: "Ask Tanaka", launchLabel: "Chat with Tanaka Matsumoto, AI assistant",
      role: "AI assistant · Tenshi Systems Engineering", online: "online", introRole: "AI assistant",
      introNote: "Tenshi Systems Engineering · always available",
      placeholder: "Ask about our services…", send: "Send", close: "Close chat", human: "Talk to a person",
      foot: "Tanaka is an AI assistant and can make mistakes.", typing: "Tanaka is typing",
      greet: "Hello, I'm **Tanaka Matsumoto**, the AI assistant for Tenshi Systems Engineering. Ask me about our services, or how to request a consultation.",
      chips: [["What services do you offer?", "What services do you offer?"], ["Web design", "Tell me about web design"], ["AI services", "Tell me about AI services"], ["Request a consultation", "How do I request a consultation?"]],
      more: [["All services", "What services do you offer?"], ["Prices", "How much does a project cost?"], ["Where are you based?", "Where are you based?"], ["Request a consultation", "How do I request a consultation?"]],
      listIntro: "We offer nine services. Ask me about any of them:",
      offers: "What's included:", details: "Full details",
      consult: "The quickest way is the **consultation form** on the homepage: tell us about your project, press Send, and your email app opens with the message ready to go. I can also pass a message to the team for you.",
      consultLink: "Consultation form",
      price: "We don't publish fixed prices, because every project is different. Send a consultation request with a few details and the team will reply with a proposal.",
      location: "Tenshi Systems Engineering is based in **Osaka, Japan**.",
      lang: "This website is available in ten languages: English, Japanese, Korean, Chinese, Spanish, German, Polish, Nigerian Pidgin, Arabic and Farsi. Use the flag button at the top to switch, and write to me in any of them.",
      who: "I'm Tanaka Matsumoto, an **AI assistant**, not a person. I can explain our services and help you get in touch with the team.",
      thanks: "You're welcome. Is there anything else I can help with?",
      hello: "Hello! What can I help you with today?",
      fallback: "I'm not sure about that one. I can tell you about our services, or pass your question on to a person on the team.",
      humanIntro: "Of course. Write your message below and press **Open email**: your email app opens with it addressed to our team. A person will reply by email.",
      formMsg: "Your message", formLog: "Include this chat", formSend: "Open email", formCopy: "Copy message", formCopied: "Copied",
      formEmpty: "Please write a short message first.",
      formDone: "Your email app should open now with the message. If it doesn't, write to {email}.",
      mailSubject: "Message from the website chat", chatHeader: "Chat with Tanaka (AI assistant)", visitor: "Visitor"
    },
    ja: {
      launch: "Tanakaに相談", launchLabel: "AIアシスタント Tanaka Matsumoto とチャット",
      role: "AIアシスタント・天使システムズエンジニアリング", online: "オンライン", introRole: "AIアシスタント",
      introNote: "天使システムズエンジニアリング・いつでも対応",
      placeholder: "サービスについて質問する…", send: "送信", close: "チャットを閉じる", human: "担当者と話す",
      foot: "TanakaはAIアシスタントのため、誤りがある場合があります。", typing: "Tanakaが入力中",
      greet: "こんにちは。天使システムズエンジニアリングのAIアシスタント、**Tanaka Matsumoto**です。サービス内容やご相談の方法について、お気軽にご質問ください。",
      chips: [["どんなサービスがありますか？", "どんなサービスがありますか？"], ["ウェブデザイン", "ウェブデザインについて教えてください"], ["AIサービス", "AIサービスについて教えてください"], ["相談を申し込む", "相談はどうやって申し込めますか？"]],
      more: [["すべてのサービス", "どんなサービスがありますか？"], ["料金", "料金はいくらですか？"], ["所在地", "どこにありますか？"], ["相談を申し込む", "相談はどうやって申し込めますか？"]],
      listIntro: "9つのサービスをご提供しています。気になるものをお尋ねください：",
      offers: "主な内容：", details: "詳しく見る",
      consult: "いちばん早いのは、ホームページの**ご相談フォーム**です。プロジェクトの内容を入力して「送信」を押すと、メッセージが入った状態でメールアプリが開きます。私から担当者へお伝えすることもできます。",
      consultLink: "ご相談フォーム",
      price: "プロジェクトごとに内容が異なるため、固定の料金は掲載していません。概要を添えてご相談いただければ、担当者からご提案をお送りします。",
      location: "天使システムズエンジニアリングは**大阪**を拠点としています。",
      lang: "このウェブサイトは、英語・日本語・韓国語・中国語・スペイン語・ドイツ語・ポーランド語・ナイジェリア・ピジン語・アラビア語・ペルシャ語の10言語でご覧いただけます。上部の国旗ボタンで切り替えられ、どの言語でも話しかけていただけます。",
      who: "私はTanaka Matsumoto、**AIアシスタント**で、人間ではありません。サービスのご説明や、担当者へのご連絡のお手伝いをします。",
      thanks: "どういたしまして。ほかにお手伝いできることはありますか？",
      hello: "こんにちは。今日はどのようなご用件でしょうか？",
      fallback: "その点については分かりかねます。サービスについてのご説明か、担当者へのお取り次ぎができます。",
      humanIntro: "かしこまりました。下にメッセージを入力して**メールを作成**を押すと、担当者宛てのメールがメールアプリで開きます。担当者からメールでお返事します。",
      formMsg: "メッセージ", formLog: "このチャットの内容を添える", formSend: "メールを作成", formCopy: "メッセージをコピー", formCopied: "コピーしました",
      formEmpty: "先に短いメッセージをご入力ください。",
      formDone: "メッセージが入った状態でメールアプリが開きます。開かない場合は {email} までご連絡ください。",
      mailSubject: "ウェブサイトのチャットからのメッセージ", chatHeader: "Tanaka（AIアシスタント）とのチャット", visitor: "訪問者"
    },
    ko: {
      launch: "Tanaka에게 문의", launchLabel: "AI 어시스턴트 Tanaka Matsumoto와 채팅",
      role: "AI 어시스턴트 · 텐시 시스템즈 엔지니어링", online: "온라인", introRole: "AI 어시스턴트",
      introNote: "텐시 시스템즈 엔지니어링 · 언제든지 응답",
      placeholder: "서비스에 대해 물어보세요…", send: "보내기", close: "채팅 닫기", human: "담당자와 이야기하기",
      foot: "Tanaka는 AI 어시스턴트이므로 틀릴 수 있습니다.", typing: "Tanaka가 입력 중",
      greet: "안녕하세요. 텐시 시스템즈 엔지니어링의 AI 어시스턴트 **Tanaka Matsumoto**입니다. 서비스나 상담 신청 방법에 대해 편하게 물어보세요.",
      chips: [["어떤 서비스가 있나요?", "어떤 서비스가 있나요?"], ["웹 디자인", "웹 디자인에 대해 알려 주세요"], ["AI 서비스", "AI 서비스에 대해 알려 주세요"], ["상담 신청", "상담은 어떻게 신청하나요?"]],
      more: [["모든 서비스", "어떤 서비스가 있나요?"], ["가격", "비용은 얼마인가요?"], ["위치", "어디에 있나요?"], ["상담 신청", "상담은 어떻게 신청하나요?"]],
      listIntro: "9가지 서비스를 제공합니다. 궁금한 것을 물어보세요:",
      offers: "주요 내용:", details: "자세히 보기",
      consult: "가장 빠른 방법은 홈페이지의 **상담 양식**입니다. 프로젝트 내용을 적고 '보내기'를 누르면 메시지가 작성된 상태로 이메일 앱이 열립니다. 제가 담당자에게 메시지를 전해 드릴 수도 있습니다.",
      consultLink: "상담 양식",
      price: "프로젝트마다 내용이 달라 정해진 가격은 공개하지 않습니다. 간단한 내용을 적어 상담을 신청하시면 담당자가 제안을 보내 드립니다.",
      location: "텐시 시스템즈 엔지니어링은 **일본 오사카**에 있습니다.",
      lang: "이 웹사이트는 영어, 일본어, 한국어, 중국어, 스페인어, 독일어, 폴란드어, 나이지리아 피진어, 아랍어, 페르시아어의 10개 언어로 볼 수 있습니다. 위쪽 국기 버튼으로 바꾸시고, 어느 언어로든 말씀해 주세요.",
      who: "저는 Tanaka Matsumoto, 사람이 아닌 **AI 어시스턴트**입니다. 서비스를 설명해 드리고 담당자와 연락하실 수 있도록 도와드립니다.",
      thanks: "천만에요. 더 도와드릴 일이 있을까요?",
      hello: "안녕하세요! 무엇을 도와드릴까요?",
      fallback: "그 부분은 잘 모르겠습니다. 서비스에 대해 알려 드리거나, 질문을 담당자에게 전해 드릴 수 있습니다.",
      humanIntro: "알겠습니다. 아래에 메시지를 적고 **이메일 작성**을 누르면 담당자에게 보내는 이메일이 이메일 앱에서 열립니다. 담당자가 이메일로 답변드립니다.",
      formMsg: "메시지", formLog: "이 채팅 내용 포함", formSend: "이메일 작성", formCopy: "메시지 복사", formCopied: "복사됨",
      formEmpty: "먼저 짧은 메시지를 적어 주세요.",
      formDone: "메시지가 작성된 상태로 이메일 앱이 열립니다. 열리지 않으면 {email}로 연락해 주세요.",
      mailSubject: "웹사이트 채팅에서 보낸 메시지", chatHeader: "Tanaka(AI 어시스턴트)와의 채팅", visitor: "방문자"
    },
    de: {
      launch: "Tanaka fragen", launchLabel: "Chat mit Tanaka Matsumoto, KI-Assistent",
      role: "KI-Assistent · Tenshi Systems Engineering", online: "online", introRole: "KI-Assistent",
      introNote: "Tenshi Systems Engineering · jederzeit erreichbar",
      placeholder: "Fragen Sie zu unseren Leistungen…", send: "Senden", close: "Chat schließen", human: "Mit einem Menschen sprechen",
      foot: "Tanaka ist ein KI-Assistent und kann sich irren.", typing: "Tanaka schreibt",
      greet: "Hallo, ich bin **Tanaka Matsumoto**, der KI-Assistent von Tenshi Systems Engineering. Fragen Sie mich zu unseren Leistungen oder wie Sie eine Beratung anfragen.",
      chips: [["Welche Leistungen bieten Sie an?", "Welche Leistungen bieten Sie an?"], ["Webdesign", "Erzählen Sie mir von Webdesign"], ["KI-Dienste", "Erzählen Sie mir von KI-Diensten"], ["Beratung anfragen", "Wie kann ich eine Beratung anfragen?"]],
      more: [["Alle Leistungen", "Welche Leistungen bieten Sie an?"], ["Preise", "Was kostet ein Projekt?"], ["Standort", "Wo sitzen Sie?"], ["Beratung anfragen", "Wie kann ich eine Beratung anfragen?"]],
      listIntro: "Wir bieten neun Leistungen an. Fragen Sie mich zu jeder davon:",
      offers: "Das gehört dazu:", details: "Alle Details",
      consult: "Am schnellsten geht es mit dem **Beratungsformular** auf der Startseite: Beschreiben Sie Ihr Projekt, klicken Sie auf „Senden“, und Ihr E-Mail-Programm öffnet sich mit der fertigen Nachricht. Ich kann auch eine Nachricht an das Team weitergeben.",
      consultLink: "Beratungsformular",
      price: "Wir veröffentlichen keine Festpreise, weil jedes Projekt anders ist. Senden Sie eine Beratungsanfrage mit ein paar Details, und das Team antwortet mit einem Angebot.",
      location: "Tenshi Systems Engineering hat seinen Sitz in **Osaka, Japan**.",
      lang: "Diese Website gibt es in zehn Sprachen: Englisch, Japanisch, Koreanisch, Chinesisch, Spanisch, Deutsch, Polnisch, Nigerianisches Pidgin, Arabisch und Persisch. Mit der Flaggen-Schaltfläche oben wechseln Sie die Sprache, und Sie können mir in jeder davon schreiben.",
      who: "Ich bin Tanaka Matsumoto, ein **KI-Assistent** und kein Mensch. Ich erkläre unsere Leistungen und helfe Ihnen, Kontakt mit dem Team aufzunehmen.",
      thanks: "Gern geschehen. Kann ich sonst noch helfen?",
      hello: "Hallo! Wobei kann ich Ihnen heute helfen?",
      fallback: "Da bin ich mir nicht sicher. Ich kann Ihnen unsere Leistungen erklären oder Ihre Frage an einen Menschen im Team weitergeben.",
      humanIntro: "Gern. Schreiben Sie unten Ihre Nachricht und klicken Sie auf **E-Mail öffnen**: Ihr E-Mail-Programm öffnet sich mit der Nachricht an unser Team. Ein Mensch antwortet per E-Mail.",
      formMsg: "Ihre Nachricht", formLog: "Diesen Chat anhängen", formSend: "E-Mail öffnen", formCopy: "Nachricht kopieren", formCopied: "Kopiert",
      formEmpty: "Bitte schreiben Sie zuerst eine kurze Nachricht.",
      formDone: "Ihr E-Mail-Programm sollte sich jetzt mit der Nachricht öffnen. Falls nicht, schreiben Sie an {email}.",
      mailSubject: "Nachricht aus dem Website-Chat", chatHeader: "Chat mit Tanaka (KI-Assistent)", visitor: "Besucher"
    },
    es: {
      "launch": "Pregunte a Tanaka",
      "launchLabel": "Chatear con Tanaka Matsumoto, asistente de IA",
      "role": "Asistente de IA · Tenshi Systems Engineering",
      "online": "en línea",
      "introRole": "Asistente de IA",
      "introNote": "Tenshi Systems Engineering · siempre disponible",
      "placeholder": "Pregunte por nuestros servicios…",
      "send": "Enviar",
      "close": "Cerrar chat",
      "human": "Hablar con una persona",
      "foot": "Tanaka es un asistente de IA y puede equivocarse.",
      "typing": "Tanaka está escribiendo",
      "greet": "Hola, soy **Tanaka Matsumoto**, el asistente de IA de Tenshi Systems Engineering. Pregúnteme por nuestros servicios o cómo solicitar una consulta.",
      "chips": [
            [
                  "¿Qué servicios ofrecen?",
                  "¿Qué servicios ofrecen?"
            ],
            [
                  "Diseño web",
                  "Háblame del diseño web"
            ],
            [
                  "Servicios de IA",
                  "Háblame de los servicios de IA"
            ],
            [
                  "Solicitar consulta",
                  "¿Cómo solicito una consulta?"
            ]
      ],
      "more": [
            [
                  "Todos los servicios",
                  "¿Qué servicios ofrecen?"
            ],
            [
                  "Precios",
                  "¿Cuánto cuesta un proyecto?"
            ],
            [
                  "¿Dónde están?",
                  "¿Dónde están ubicados?"
            ],
            [
                  "Solicitar consulta",
                  "¿Cómo solicito una consulta?"
            ]
      ],
      "listIntro": "Ofrecemos nueve servicios. Pregúnteme por cualquiera:",
      "offers": "Qué incluye:",
      "details": "Ver detalles",
      "consult": "Lo más rápido es el **formulario de consulta** de la web: cuéntenos su proyecto, pulse Enviar y su aplicación de correo se abrirá con el mensaje listo. También puedo pasar un mensaje al equipo.",
      "consultLink": "Formulario de consulta",
      "price": "No publicamos precios fijos porque cada proyecto es diferente. Envíe una solicitud de consulta con algunos detalles y el equipo le responderá con una propuesta.",
      "location": "Tenshi Systems Engineering tiene su sede en **Osaka, Japón**.",
      "lang": "Este sitio web está disponible en diez idiomas: inglés, japonés, coreano, chino, español, alemán, polaco, pidgin nigeriano, árabe y persa. Use el botón de la bandera arriba para cambiar y escríbame en cualquiera de ellos.",
      "who": "Soy Tanaka Matsumoto, un **asistente de IA**, no una persona. Puedo explicarle nuestros servicios y ayudarle a contactar con el equipo.",
      "thanks": "De nada. ¿Puedo ayudarle en algo más?",
      "hello": "¡Hola! ¿En qué puedo ayudarle hoy?",
      "fallback": "No estoy seguro de eso. Puedo contarle sobre nuestros servicios o pasar su pregunta a una persona del equipo.",
      "humanIntro": "Por supuesto. Escriba su mensaje abajo y pulse **Abrir correo**: su aplicación de correo se abrirá con el mensaje dirigido a nuestro equipo. Una persona le responderá por correo.",
      "formMsg": "Su mensaje",
      "formLog": "Incluir este chat",
      "formSend": "Abrir correo",
      "formCopy": "Copiar mensaje",
      "formCopied": "Copiado",
      "formEmpty": "Escriba primero un mensaje breve.",
      "formDone": "Su aplicación de correo debería abrirse ahora con el mensaje. Si no, escriba a {email}.",
      "mailSubject": "Mensaje desde el chat del sitio web",
      "chatHeader": "Chat con Tanaka (asistente de IA)",
      "visitor": "Visitante"
    },
    zh: {
      "launch": "问问 Tanaka",
      "launchLabel": "与 AI 助手 Tanaka Matsumoto 聊天",
      "role": "AI 助手 · 天使系统工程",
      "online": "在线",
      "introRole": "AI 助手",
      "introNote": "天使系统工程 · 随时为您服务",
      "placeholder": "咨询我们的服务…",
      "send": "发送",
      "close": "关闭聊天",
      "human": "与工作人员沟通",
      "foot": "Tanaka 是 AI 助手，回答可能有误。",
      "typing": "Tanaka 正在输入",
      "greet": "您好，我是天使系统工程的 AI 助手 **Tanaka Matsumoto**。欢迎咨询我们的服务或如何预约咨询。",
      "chips": [
            [
                  "你们提供哪些服务？",
                  "你们提供哪些服务？"
            ],
            [
                  "网页设计",
                  "介绍一下网页设计"
            ],
            [
                  "AI 服务",
                  "介绍一下 AI 服务"
            ],
            [
                  "预约咨询",
                  "怎么预约咨询？"
            ]
      ],
      "more": [
            [
                  "全部服务",
                  "你们提供哪些服务？"
            ],
            [
                  "价格",
                  "项目要多少钱？"
            ],
            [
                  "公司在哪里？",
                  "你们在哪里？"
            ],
            [
                  "预约咨询",
                  "怎么预约咨询？"
            ]
      ],
      "listIntro": "我们提供九项服务，欢迎询问任何一项：",
      "offers": "包括：",
      "details": "查看详情",
      "consult": "最快的方式是网站上的**咨询表单**：介绍您的项目，点击“发送”，您的邮件应用会打开并写好消息。我也可以替您转告团队。",
      "consultLink": "咨询表单",
      "price": "每个项目都不同，因此我们不公布固定价格。请提交咨询并附上一些细节，团队会回复您一份方案。",
      "location": "天使系统工程总部位于**日本大阪**。",
      "lang": "本网站提供十种语言：英语、日语、韩语、中文、西班牙语、德语、波兰语、尼日利亚皮钦语、阿拉伯语和波斯语。点击顶部的国旗按钮即可切换，您可以用其中任何一种语言和我交流。",
      "who": "我是 Tanaka Matsumoto，一个 **AI 助手**，不是真人。我可以介绍我们的服务，并帮您联系团队。",
      "thanks": "不客气。还有什么可以帮您？",
      "hello": "您好！今天有什么可以帮您？",
      "fallback": "这个问题我不太确定。我可以介绍我们的服务，或把您的问题转给团队的工作人员。",
      "humanIntro": "当然可以。请在下方写下留言并点击**打开邮件**：您的邮件应用会打开，收件人是我们的团队。工作人员会通过邮件回复您。",
      "formMsg": "您的留言",
      "formLog": "附上本次聊天记录",
      "formSend": "打开邮件",
      "formCopy": "复制留言",
      "formCopied": "已复制",
      "formEmpty": "请先写一段简短的留言。",
      "formDone": "您的邮件应用即将打开并已写好消息。如果没有打开，请发送邮件至 {email}。",
      "mailSubject": "来自网站聊天的消息",
      "chatHeader": "与 Tanaka（AI 助手）的聊天",
      "visitor": "访客"
    },
    ar: {
      "launch": "اسأل تاناكا",
      "launchLabel": "تحدّث مع المساعد الذكي تاناكا ماتسوموتو",
      "role": "مساعد ذكي · تنشي لهندسة الأنظمة",
      "online": "متصل",
      "introRole": "مساعد ذكي",
      "introNote": "تنشي لهندسة الأنظمة · متاح دائمًا",
      "placeholder": "اسأل عن خدماتنا…",
      "send": "إرسال",
      "close": "إغلاق المحادثة",
      "human": "تحدّث مع شخص",
      "foot": "تاناكا مساعد ذكي وقد يخطئ.",
      "typing": "تاناكا يكتب",
      "greet": "مرحبًا، أنا **تاناكا ماتسوموتو**، المساعد الذكي لشركة تنشي لهندسة الأنظمة. اسألني عن خدماتنا أو عن طريقة طلب استشارة.",
      "chips": [
            [
                  "ما الخدمات التي تقدّمونها؟",
                  "ما الخدمات التي تقدّمونها؟"
            ],
            [
                  "تصميم المواقع",
                  "أخبرني عن تصميم المواقع"
            ],
            [
                  "خدمات الذكاء الاصطناعي",
                  "أخبرني عن خدمات الذكاء الاصطناعي"
            ],
            [
                  "اطلب استشارة",
                  "كيف أطلب استشارة؟"
            ]
      ],
      "more": [
            [
                  "كل الخدمات",
                  "ما الخدمات التي تقدّمونها؟"
            ],
            [
                  "الأسعار",
                  "كم تكلفة المشروع؟"
            ],
            [
                  "أين تقعون؟",
                  "أين مقرّكم؟"
            ],
            [
                  "اطلب استشارة",
                  "كيف أطلب استشارة؟"
            ]
      ],
      "listIntro": "نقدّم تسع خدمات. اسألني عن أيٍّ منها:",
      "offers": "تشمل:",
      "details": "عرض التفاصيل",
      "consult": "أسرع طريقة هي **نموذج الاستشارة** في الموقع: أخبرونا عن مشروعكم واضغطوا «إرسال»، فيُفتح تطبيق البريد والرسالة جاهزة. ويمكنني أيضًا إيصال رسالة إلى الفريق.",
      "consultLink": "نموذج الاستشارة",
      "price": "لا ننشر أسعارًا ثابتة لأن كل مشروع مختلف. أرسلوا طلب استشارة مع بعض التفاصيل وسيرد الفريق بعرض مناسب.",
      "location": "يقع مقرّ تنشي لهندسة الأنظمة في **أوساكا، اليابان**.",
      "lang": "يتوفر هذا الموقع بعشر لغات: الإنجليزية واليابانية والكورية والصينية والإسبانية والألمانية والبولندية والبيدجن النيجيرية والعربية والفارسية. استخدموا زر العلم في الأعلى للتبديل، واكتبوا لي بأيٍّ منها.",
      "who": "أنا تاناكا ماتسوموتو، **مساعد ذكي** ولست إنسانًا. يمكنني شرح خدماتنا ومساعدتكم على التواصل مع الفريق.",
      "thanks": "على الرحب والسعة. هل يمكنني مساعدتكم في شيء آخر؟",
      "hello": "مرحبًا! كيف يمكنني مساعدتكم اليوم؟",
      "fallback": "لست متأكدًا من ذلك. يمكنني إخباركم عن خدماتنا أو نقل سؤالكم إلى أحد أعضاء الفريق.",
      "humanIntro": "بكل سرور. اكتبوا رسالتكم أدناه واضغطوا **فتح البريد**، فيُفتح تطبيق البريد والرسالة موجّهة إلى فريقنا. سيرد عليكم أحد الأشخاص عبر البريد.",
      "formMsg": "رسالتكم",
      "formLog": "إرفاق هذه المحادثة",
      "formSend": "فتح البريد",
      "formCopy": "نسخ الرسالة",
      "formCopied": "تم النسخ",
      "formEmpty": "يرجى كتابة رسالة قصيرة أولًا.",
      "formDone": "من المفترض أن يُفتح تطبيق البريد الآن والرسالة جاهزة. إن لم يُفتح، راسلونا على {email}.",
      "mailSubject": "رسالة من محادثة الموقع",
      "chatHeader": "محادثة مع تاناكا (مساعد ذكي)",
      "visitor": "زائر"
    },
    pl: {
      "launch": "Zapytaj Tanakę",
      "launchLabel": "Czat z Tanaką Matsumoto, asystentem AI",
      "role": "Asystent AI · Tenshi Systems Engineering",
      "online": "online",
      "introRole": "Asystent AI",
      "introNote": "Tenshi Systems Engineering · zawsze do dyspozycji",
      "placeholder": "Zapytaj o nasze usługi…",
      "send": "Wyślij",
      "close": "Zamknij czat",
      "human": "Porozmawiaj z człowiekiem",
      "foot": "Tanaka jest asystentem AI i może się mylić.",
      "typing": "Tanaka pisze",
      "greet": "Dzień dobry, jestem **Tanaka Matsumoto**, asystent AI Tenshi Systems Engineering. Proszę pytać o nasze usługi lub o to, jak umówić konsultację.",
      "chips": [
            [
                  "Jakie usługi oferujecie?",
                  "Jakie usługi oferujecie?"
            ],
            [
                  "Projektowanie stron",
                  "Opowiedz o projektowaniu stron"
            ],
            [
                  "Usługi AI",
                  "Opowiedz o usługach AI"
            ],
            [
                  "Umów konsultację",
                  "Jak umówić konsultację?"
            ]
      ],
      "more": [
            [
                  "Wszystkie usługi",
                  "Jakie usługi oferujecie?"
            ],
            [
                  "Ceny",
                  "Ile kosztuje projekt?"
            ],
            [
                  "Gdzie jesteście?",
                  "Gdzie jest wasza siedziba?"
            ],
            [
                  "Umów konsultację",
                  "Jak umówić konsultację?"
            ]
      ],
      "listIntro": "Oferujemy dziewięć usług. Proszę zapytać o dowolną:",
      "offers": "Co obejmuje:",
      "details": "Szczegóły",
      "consult": "Najszybciej przez **formularz konsultacji** na stronie: proszę opisać projekt i kliknąć „Wyślij”, a program pocztowy otworzy się z gotową wiadomością. Mogę też przekazać wiadomość zespołowi.",
      "consultLink": "Formularz konsultacji",
      "price": "Nie publikujemy stałych cen, bo każdy projekt jest inny. Proszę wysłać zapytanie z kilkoma szczegółami, a zespół odpowie ofertą.",
      "location": "Tenshi Systems Engineering ma siedzibę w **Osace w Japonii**.",
      "lang": "Strona jest dostępna w dziesięciu językach: angielskim, japońskim, koreańskim, chińskim, hiszpańskim, niemieckim, polskim, nigeryjskim pidżynie, arabskim i perskim. Język zmienia się przyciskiem z flagą u góry, a pisać do mnie można w każdym z nich.",
      "who": "Jestem Tanaka Matsumoto, **asystent AI**, a nie człowiek. Mogę opowiedzieć o naszych usługach i pomóc skontaktować się z zespołem.",
      "thanks": "Proszę bardzo. Czy mogę jeszcze w czymś pomóc?",
      "hello": "Dzień dobry! W czym mogę dziś pomóc?",
      "fallback": "Nie jestem tego pewien. Mogę opowiedzieć o naszych usługach albo przekazać pytanie osobie z zespołu.",
      "humanIntro": "Oczywiście. Proszę napisać wiadomość poniżej i kliknąć **Otwórz e-mail**: program pocztowy otworzy się z wiadomością do naszego zespołu. Odpowie człowiek, e-mailem.",
      "formMsg": "Wiadomość",
      "formLog": "Dołącz ten czat",
      "formSend": "Otwórz e-mail",
      "formCopy": "Kopiuj wiadomość",
      "formCopied": "Skopiowano",
      "formEmpty": "Proszę najpierw napisać krótką wiadomość.",
      "formDone": "Program pocztowy powinien się teraz otworzyć z wiadomością. Jeśli nie, proszę pisać na {email}.",
      "mailSubject": "Wiadomość z czatu na stronie",
      "chatHeader": "Czat z Tanaką (asystent AI)",
      "visitor": "Gość"
    },
    pcm: {
      "launch": "Ask Tanaka",
      "launchLabel": "Chat with Tanaka Matsumoto, AI assistant",
      "role": "AI assistant · Tenshi Systems Engineering",
      "online": "online",
      "introRole": "AI assistant",
      "introNote": "Tenshi Systems Engineering · we dey always",
      "placeholder": "Ask about our services…",
      "send": "Send",
      "close": "Close chat",
      "human": "Talk to person",
      "foot": "Tanaka na AI assistant, e fit make mistake.",
      "typing": "Tanaka dey type",
      "greet": "How far! I be **Tanaka Matsumoto**, di AI assistant for Tenshi Systems Engineering. Ask me about our services, or how you fit request consultation.",
      "chips": [
            [
                  "Which services una dey offer?",
                  "Which services una dey offer?"
            ],
            [
                  "Web design",
                  "Tell me about web design"
            ],
            [
                  "AI services",
                  "Tell me about AI services"
            ],
            [
                  "Ask for consultation",
                  "How I fit ask for consultation?"
            ]
      ],
      "more": [
            [
                  "All services",
                  "Which services una dey offer?"
            ],
            [
                  "Price",
                  "How much project go cost?"
            ],
            [
                  "Where una dey?",
                  "Where una dey?"
            ],
            [
                  "Ask for consultation",
                  "How I fit ask for consultation?"
            ]
      ],
      "listIntro": "We get nine services. Ask me about any one:",
      "offers": "Wetin dey inside:",
      "details": "See full details",
      "consult": "Di fastest way na di **consultation form** for di website: tell us about your project, press Send, and your email app go open with di message ready. I fit also pass message give di team.",
      "consultLink": "Consultation form",
      "price": "We no dey put fixed price because every project different. Send consultation request with small details and di team go reply with proposal.",
      "location": "Tenshi Systems Engineering dey **Osaka, Japan**.",
      "lang": "Dis website dey for ten languages: English, Japanese, Korean, Chinese, Spanish, German, Polish, Nigerian Pidgin, Arabic and Farsi. Use di flag button for top to change, and you fit write me for any of dem.",
      "who": "I be Tanaka Matsumoto, **AI assistant**, I no be human. I fit explain our services and help you reach di team.",
      "thanks": "No wahala. Anything else wey I fit help you with?",
      "hello": "How you dey! Wetin I fit do for you today?",
      "fallback": "I no too sure about dat one. I fit tell you about our services, or I go pass your question give person for di team.",
      "humanIntro": "No problem. Write your message for down and press **Open email**: your email app go open with di message for our team. Real person go reply you by email.",
      "formMsg": "Your message",
      "formLog": "Add dis chat",
      "formSend": "Open email",
      "formCopy": "Copy message",
      "formCopied": "Don copy",
      "formEmpty": "Abeg write short message first.",
      "formDone": "Your email app suppose open now with di message. If e no open, write us for {email}.",
      "mailSubject": "Message from website chat",
      "chatHeader": "Chat with Tanaka (AI assistant)",
      "visitor": "Visitor"
    },
    fa: {
      "launch": "از تاناکا بپرسید",
      "launchLabel": "گفت‌وگو با تاناکا ماتسوموتو، دستیار هوش مصنوعی",
      "role": "دستیار هوش مصنوعی · تنشی سیستمز انجینیرینگ",
      "online": "آنلاین",
      "introRole": "دستیار هوش مصنوعی",
      "introNote": "تنشی سیستمز انجینیرینگ · همیشه در دسترس",
      "placeholder": "دربارهٔ خدمات ما بپرسید…",
      "send": "ارسال",
      "close": "بستن گفت‌وگو",
      "human": "گفت‌وگو با یک فرد",
      "foot": "تاناکا دستیار هوش مصنوعی است و ممکن است اشتباه کند.",
      "typing": "تاناکا در حال نوشتن است",
      "greet": "سلام، من **تاناکا ماتسوموتو** هستم، دستیار هوش مصنوعی تنشی سیستمز انجینیرینگ. دربارهٔ خدمات ما یا نحوهٔ درخواست مشاوره از من بپرسید.",
      "chips": [
            [
                  "چه خدماتی ارائه می‌دهید؟",
                  "چه خدماتی ارائه می‌دهید؟"
            ],
            [
                  "طراحی وب",
                  "دربارهٔ طراحی وب بگویید"
            ],
            [
                  "خدمات هوش مصنوعی",
                  "دربارهٔ خدمات هوش مصنوعی بگویید"
            ],
            [
                  "درخواست مشاوره",
                  "چطور درخواست مشاوره بدهم؟"
            ]
      ],
      "more": [
            [
                  "همهٔ خدمات",
                  "چه خدماتی ارائه می‌دهید؟"
            ],
            [
                  "قیمت‌ها",
                  "هزینهٔ یک پروژه چقدر است؟"
            ],
            [
                  "کجا هستید؟",
                  "دفتر شما کجاست؟"
            ],
            [
                  "درخواست مشاوره",
                  "چطور درخواست مشاوره بدهم؟"
            ]
      ],
      "listIntro": "نُه خدمت ارائه می‌دهیم. دربارهٔ هر کدام بپرسید:",
      "offers": "شامل:",
      "details": "دیدن جزئیات",
      "consult": "سریع‌ترین راه **فرم مشاوره** در وب‌سایت است: دربارهٔ پروژه‌تان بنویسید و «ارسال» را بزنید تا برنامهٔ ایمیل با پیامی آماده باز شود. من هم می‌توانم پیامی به تیم برسانم.",
      "consultLink": "فرم مشاوره",
      "price": "چون هر پروژه متفاوت است، قیمت ثابت منتشر نمی‌کنیم. درخواست مشاوره را با چند جزئیات بفرستید تا تیم با یک پیشنهاد پاسخ دهد.",
      "location": "دفتر تنشی سیستمز انجینیرینگ در **اوساکا، ژاپن** است.",
      "lang": "این وب‌سایت به ده زبان در دسترس است: انگلیسی، ژاپنی، کره‌ای، چینی، اسپانیایی، آلمانی، لهستانی، پیجین نیجریه‌ای، عربی و فارسی. با دکمهٔ پرچم در بالای صفحه زبان را تغییر دهید و به هر کدام که خواستید برایم بنویسید.",
      "who": "من تاناکا ماتسوموتو هستم، یک **دستیار هوش مصنوعی** و نه یک انسان. می‌توانم خدمات ما را توضیح دهم و به شما کمک کنم با تیم تماس بگیرید.",
      "thanks": "خواهش می‌کنم. کار دیگری هست که بتوانم انجام دهم؟",
      "hello": "سلام! امروز چه کمکی از من برمی‌آید؟",
      "fallback": "از این مورد مطمئن نیستم. می‌توانم دربارهٔ خدمات ما بگویم یا پرسش شما را به یکی از اعضای تیم برسانم.",
      "humanIntro": "حتماً. پیام خود را در پایین بنویسید و **باز کردن ایمیل** را بزنید تا برنامهٔ ایمیل با پیامی خطاب به تیم ما باز شود. یک فرد از طریق ایمیل پاسخ می‌دهد.",
      "formMsg": "پیام شما",
      "formLog": "پیوست کردن این گفت‌وگو",
      "formSend": "باز کردن ایمیل",
      "formCopy": "کپی پیام",
      "formCopied": "کپی شد",
      "formEmpty": "لطفاً ابتدا پیامی کوتاه بنویسید.",
      "formDone": "برنامهٔ ایمیل شما باید اکنون با پیام باز شود. اگر باز نشد، به {email} بنویسید.",
      "mailSubject": "پیامی از گفت‌وگوی وب‌سایت",
      "chatHeader": "گفت‌وگو با تاناکا (دستیار هوش مصنوعی)",
      "visitor": "بازدیدکننده"
    }
  };

  /* ---------- small helpers ---------- */
  function lang() { var l = document.documentElement.lang; return UI[l] ? l : "en"; }
  function u(key) { return UI[lang()][key]; }
  function tr(key) { var L = T[lang()] || {}; return L[key] !== undefined ? L[key] : (T.en || {})[key] || ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]{1,80})\]\(([^)\s]{1,200})\)/g, function (m, t, href) {
        var h = href.replace(/&amp;/g, "&");
        if (!/^(https?:\/\/|[a-z0-9-]+\.html|index\.html|services\/)/i.test(h)) return t;
        if (!/^https?:/.test(h)) h = BASE + h;
        return '<a href="' + esc(h) + '">' + t + "</a>";
      });
  }
  function md(text) {
    var out = "", list = false;
    String(text || "").split("\n").forEach(function (l) {
      var li = /^\s*[-•]\s+(.*)/.exec(l);
      if (li) { if (!list) { out += "<ul>"; list = true; } out += "<li>" + inline(li[1]) + "</li>"; return; }
      if (list) { out += "</ul>"; list = false; }
      if (l.trim()) out += "<p>" + inline(l) + "</p>";
    });
    return out + (list ? "</ul>" : "");
  }
  function store(k, v) {
    try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || "null"); sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function svg(name) {
    var p = {
      send: '<path d="M4 12 20 4l-6 16-2.5-6.5z"/><path d="m11.5 13.5 4-4"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>',
      human: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"/>',
      chat: '<path d="M5 5h14v10H9l-4 4z"/>'
    }[name];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }
  // Tanaka's badge: a monogram in the company's red, with a spark for "AI". An emblem, not a photo of a person.
  var BADGE = '<svg class="tk-badge" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="tkg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0263f"/><stop offset="1" stop-color="#8e0b20"/></linearGradient></defs>' +
    '<circle cx="24" cy="24" r="24" fill="url(#tkg)"/><circle cx="24" cy="24" r="20.5" fill="none" stroke="#fff" stroke-opacity=".35"/>' +
    '<text x="24" y="30.5" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-weight="800" font-size="17" fill="#fff" letter-spacing=".5">TM</text>' +
    '<path d="M36.5 9.5l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2z" fill="#fff"/></svg>';

  // His illustrated portrait (img/tanaka.svg) replaces the monogram wherever it appears.
  BADGE = '<img class="tk-badge" src="' + BASE + 'img/tanaka.svg" alt="" width="200" height="200">';

  /* ---------- answers from the site's own text ---------- */
  var KEYS = {
    webdesign: /web ?design|website design|site design|ui|ux|ウェブデザイン|サイトデザイン|웹 ?디자인|webdesign|diseño web|网页设计|网站设计|تصميم المواقع|تصميم الويب|projektowanie stron|طراحی وب|طراحی سایت/,
    webdev: /web ?dev|web development|website develop|build (a |my )?(web)?site|e-?commerce|online (store|shop)|booking|ウェブ開発|サイト制作|ec|웹 ?개발|쇼핑몰|webentwicklung|onlineshop|desarrollo web|网站开发|网页开发|تطوير المواقع|tworzenie stron|توسعهٔ وب|توسعه وب/,
    software: /software|application|\bapp\b|program|ソフトウェア|アプリ|システム開発|소프트웨어|앱|애플리케이션|softwareentwicklung|anwendung|software|软件|برمجيات|oprogramowanie|نرم‌افزار|نرم افزار/,
    consulting: /consult(ing)?\b(?! request)|strategy|roadmap|advice|modernis|moderniz|コンサル|戦略|컨설팅|전략|beratung(?!sanfrage)|strategie|technologieberatung|consultoría|技术咨询|استشارات تقنية|doradztwo|مشاورهٔ فناوری/,
    media: /media|video|graphic|motion|photo|presentation|メディア|映像|グラフィック|動画|미디어|영상|그래픽|medien|grafik|videoschnitt|multimedia|vídeo|媒体|视频|وسائط|فيديو|multimedi|wideo|رسانه|ویدیو/,
    hosting: /host|domain|ssl|server|backup|uptime|dns|ホスティング|ドメイン|サーバー|バックアップ|호스팅|도메인|서버|백업|domains?\b|alojamiento|dominio|servidor|托管|域名|服务器|استضافة|نطاق|خادم|serwer|domen|میزبانی|دامنه|سرور/,
    ai: /\bai\b|a\.i\.|artificial|chatbot|chat assistant|automat|machine learning|ＡＩ|人工知能|自動化|チャットボット|인공지능|자동화|챗봇|\bki\b|künstlich|kuenstlich|\bia\b|inteligencia artificial|人工智能|ذكاء اصطناعي|sztuczn|هوش مصنوعی/,
    cms: /\bcms\b|content manag|wordpress|update (my |the )?(site|website|pages)|コンテンツ管理|更新|콘텐츠 ?관리|content-management|inhalte|gestión de contenidos|内容管理|إدارة المحتوى|zarządzanie treścią|مدیریت محتوا/,
    branding: /brand|logo|identity|typograph|ブランド|ロゴ|브랜드|로고|marke|logo|marca|logotipo|品牌|标志|علامة تجارية|شعار|logo|برند|لوگو/
  };
  var INTENTS = [
    ["who", /who are you|are you (an? )?(real )?(ai|bot|robot|human|person|real)|your name|あなたは(誰|だれ)|ロボット|人間ですか|aiですか|누구|봇이|사람이에요|사람인가요|wer bist|sind sie (ein )?(mensch|bot|ki)|bist du (ein )?(mensch|bot|ki)|quién eres|eres (un )?(robot|humano|ia)|你是谁|你是(机器人|真人)|من أنت|هل أنت (إنسان|روبوت)|kim jesteś|czy jesteś (człowiekiem|botem)|who you be|you be human|تو کی هستی|آیا (انسان|ربات) هستی/],
    ["human", /talk to (a |an )?(real )?(person|human|someone|staff)|speak (to|with) (a |an )?(real )?(person|human|someone)|contact (a |an )?(person|human)|担当者と|人と話|사람과 (이야기|대화)|담당자와|mit einem menschen|mitarbeiter sprechen|hablar con una persona|人工|真人客服|التحدث مع شخص|porozmawiać z człowiekiem|talk to person|با یک فرد/],
    ["price", /price|pricing|cost|how much|rate|budget|quote|estimate|料金|費用|いくら|価格|見積|가격|비용|얼마|견적|preis|kosten|kostet|wie viel|wie teuer|angebot|precio|cuánto cuesta|cuesta|价格|多少钱|费用|سعر|تكلفة|كم|cena|ile kosztuje|koszt|how much e go cost|price|قیمت|هزینه|چقدر/],
    ["consult", /consultation|contact|reach|get in touch|email|e-mail|hire|start a project|work with|相談|問い合わせ|お問合せ|連絡|依頼|상담|문의|연락|의뢰|kontakt|beratungsanfrage|beratung anfragen|anfrage|erreichen|consulta|contacto|contactar|咨询|联系|استشارة|تواصل|konsultac|kontakt|consultation|مشاوره|تماس/],
    ["location", /where|location|located|based|office|address|osaka|japan|どこ|場所|所在地|大阪|어디|위치|오사카|wo (sind|sitzen|ist)|standort|sitz|dónde|ubicad|在哪|地址|أين|مقر|gdzie|siedzib|where una dey|کجا|دفتر/],
    ["lang", /language|english|japanese|korean|german|translate|言語|英語|韓国語|ドイツ語|언어|영어|일본어|독일어|sprache|englisch|japanisch|koreanisch|idioma|语言|لغة|لغات|język|języki|language|زبان/],
    ["list", /services|what do you (do|offer)|what can you do|offer|サービス|事業|何をして|서비스|무엇을|leistungen|angebot|was (machen|bieten)|servicios|qué ofrecen|服务|خدمات|usługi|services|خدمات/],
    ["thanks", /thank|thx|ありがとう|感謝|감사|고마워|고맙|danke|gracias|谢谢|شكرا|شكرًا|dziękuję|dzięki|thank you|تشکر|مرسی|ممنون/],
    ["hello", /^(hi|hello|hey|good (morning|afternoon|evening)|こんにちは|こんばんは|おはよう|안녕|hallo|guten (tag|morgen|abend)|servus|hola|buenos días|你好|您好|مرحبا|السلام عليكم|dzień dobry|cześć|how far|how you dey|سلام|درود)\b/]
  ];
  function fold(s) { return String(s || "").toLowerCase().normalize("NFKC"); }
  function serviceAnswer(id, slug) {
    var offers = [1, 2, 3, 4, 5].map(function (n) { return "- " + tr("svc_" + id + "_o" + n); }).join("\n");
    return { text: "**" + tr("svc_" + id + "_title") + "**\n" + tr("svc_" + id + "_intro") + "\n" + u("offers") + "\n" + offers,
      links: [{ href: "services/" + slug + ".html", label: u("details") + ": " + tr("svc_" + id + "_title") }, { href: "index.html#contact", label: u("consultLink") }] };
  }
  function local(q) {
    var f = fold(q);
    // A named service first, so "how much is hosting?" still talks about hosting.
    for (var i = 0; i < SERVICES.length; i++) {
      var id = SERVICES[i][0];
      if (KEYS[id].test(f) && !/^(how much|price|料金|가격|preis)/.test(f)) return serviceAnswer(id, SERVICES[i][1]);
    }
    for (var j = 0; j < INTENTS.length; j++) if (INTENTS[j][1].test(f)) {
      var k = INTENTS[j][0];
      if (k === "human") return { text: u("humanIntro"), handoff: true };
      if (k === "list") return {
        text: u("listIntro") + "\n" + SERVICES.map(function (s) { return "- [" + tr("svc_" + s[0] + "_title") + "](services/" + s[1] + ".html): " + tr("svc_" + s[0] + "_short"); }).join("\n")
      };
      if (k === "consult" || k === "price") return { text: u(k), links: [{ href: "index.html#contact", label: u("consultLink") }], offerHuman: true };
      return { text: u(k) };
    }
    // Last try: the service whose text shares the most words with the question.
    var words = f.split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length > 3; });
    var best = null, bestScore = 0;
    SERVICES.forEach(function (s) {
      var text = fold([tr("svc_" + s[0] + "_title"), tr("svc_" + s[0] + "_short"), tr("svc_" + s[0] + "_intro")].join(" "));
      var score = words.filter(function (w) { return text.indexOf(w) !== -1; }).length;
      if (score > bestScore) { best = s; bestScore = score; }
    });
    if (best && bestScore >= 2) return serviceAnswer(best[0], best[1]);
    return { text: u("fallback"), offerHuman: true };
  }

  /* ---------- fun mode: switched on when a visitor asks for a joke ("be serious" switches it off) ----------
     Jokes are written for each language (puns don't translate). Tanaka's English stays fluent: the humour is in
     the jokes and his over-the-top politeness, never in how anyone speaks. */
  var FUN = {
    en: {
      on: "Fun mode activated. 🙇 I have informed the server, and it has kindly agreed to be in a good mood.",
      off: "Understood. Returning to serious mode. The server thanks you for the break.",
      sorry: "No need to apologize! 🙇 I bow on behalf of your keyboard.",
      chips: [["Another joke", "Tell me another joke"], ["Be serious", "Be serious, please"]],
      jokes: [
        "Why do programmers prefer dark mode? Because light attracts bugs.",
        "I would tell you a UDP joke, but you might not get it.",
        "There are 10 kinds of people in the world: those who understand binary, and those who don't.",
        "I asked our AI team for a joke about machine learning. It's still training.",
        "Why is our database always so calm? It has excellent relationships.",
        "Why did the web designer take a holiday? They had run out of margin.",
        "Our hosting team never panics. They just take a moment to cache their breath.",
        "A good brand speaks for itself. Ours has been asked to speak a little more quietly in meetings."
      ],
      bows: [
        "🙇 Thank you for your question. I have also thanked the server for its hard work.",
        "🙇 Please forgive the 0.3-second delay. A formal apology has been sent to the data center.",
        "🙇 It is an honour to answer. The keyboard you typed on deserves recognition as well.",
        "🙇 Your question has been filed under “Excellent”. The filing cabinet is very proud."
      ]
    },
    ja: {
      on: "おもしろモードを起動しました。🙇 サーバーにもご機嫌でいてもらうよう、丁重にお願いしておきました。",
      off: "承知しました。真面目モードに戻ります。サーバーも「休憩をありがとうございました」と申しております。",
      sorry: "どうかお気になさらず！🙇 キーボードに代わって私が頭を下げます。",
      chips: [["もうひとつ冗談", "もうひとつ冗談を言ってください"], ["真面目に", "真面目にお願いします"]],
      jokes: [
        "プログラマーがダークモードを好む理由をご存じですか？ 明るいとバグ（虫）が寄ってくるからです。",
        "サーバーが落ちても、私たちは落ち込みません。すぐに立ち上げますので。",
        "AIチームに冗談をお願いしたところ、「ただいま学習中です」とのことでした。",
        "データベースがいつも落ち着いている理由は？ リレーション（関係）が良好だからです。",
        "ウェブデザイナーが休暇を取った理由は？ 余白（マージン）が足りなくなったからです。",
        "ふとんがふっとんだ。……失礼いたしました。エンジニアの朝のあいさつでございます。"
      ],
      bows: [
        "🙇 ご質問ありがとうございます。サーバーにも日頃の働きへの感謝を伝えておきました。",
        "🙇 0.3秒お待たせして申し訳ございません。データセンターには正式にお詫び申し上げました。",
        "🙇 お答えできて光栄です。ご入力いただいたキーボードにも敬意を表します。",
        "🙇 ご質問は「大変すばらしい」に分類いたしました。ファイルキャビネットも誇らしげです。"
      ]
    },
    ko: {
      on: "재미 모드가 켜졌습니다. 🙇 서버에게도 기분 좋게 있어 달라고 정중히 부탁해 두었습니다.",
      off: "알겠습니다. 진지 모드로 돌아갑니다. 서버도 쉬는 시간 고마웠다고 전해 달래요.",
      sorry: "사과하지 않으셔도 됩니다! 🙇 키보드를 대신해 제가 고개 숙여 인사드립니다.",
      chips: [["농담 하나 더", "농담 하나 더 해 주세요"], ["진지하게", "진지하게 해 주세요"]],
      jokes: [
        "프로그래머가 다크 모드를 좋아하는 이유는? 빛이 버그(벌레)를 끌어들이니까요.",
        "세상에는 10종류의 사람이 있습니다. 이진법을 아는 사람과 모르는 사람.",
        "AI 팀에게 농담을 부탁했더니 아직 학습 중이래요.",
        "데이터베이스가 늘 차분한 이유는? 관계(릴레이션)가 아주 좋거든요.",
        "웹 디자이너가 휴가를 낸 이유는? 여백(마진)이 부족해서요.",
        "서버가 다운돼도 저희는 다운되지 않습니다. 바로 다시 올리니까요."
      ],
      bows: [
        "🙇 질문해 주셔서 감사합니다. 서버에게도 수고했다고 감사 인사를 전했습니다.",
        "🙇 0.3초 기다리게 해 드려 죄송합니다. 데이터 센터에는 정식으로 사과드렸습니다.",
        "🙇 답변드리게 되어 영광입니다. 입력하신 키보드에도 경의를 표합니다.",
        "🙇 질문을 '매우 훌륭함'으로 분류했습니다. 서류함도 무척 자랑스러워합니다."
      ]
    },
    de: {
      on: "Spaßmodus aktiviert. 🙇 Ich habe den Server höflich gebeten, ebenfalls gute Laune zu haben.",
      off: "Verstanden. Zurück zum ernsten Modus. Der Server bedankt sich für die Pause.",
      sorry: "Keine Entschuldigung nötig! 🙇 Ich verbeuge mich im Namen Ihrer Tastatur.",
      chips: [["Noch ein Witz", "Erzählen Sie noch einen Witz"], ["Bitte ernst", "Bitte wieder ernst"]],
      jokes: [
        "Warum bevorzugen Programmierer den Dark Mode? Weil Licht Bugs anzieht.",
        "Ich würde Ihnen einen UDP-Witz erzählen, aber vielleicht kommt er nicht an.",
        "Es gibt 10 Arten von Menschen: die, die Binär verstehen, und die, die es nicht tun.",
        "Ich habe unser KI-Team um einen Witz über maschinelles Lernen gebeten. Es trainiert noch.",
        "Warum ist unsere Datenbank immer so entspannt? Sie pflegt hervorragende Beziehungen.",
        "Warum hat der Webdesigner Urlaub genommen? Ihm ist der Spielraum ausgegangen. Genauer gesagt: das Padding."
      ],
      bows: [
        "🙇 Vielen Dank für Ihre Frage. Ich habe mich auch beim Server für seine harte Arbeit bedankt.",
        "🙇 Bitte entschuldigen Sie die Verzögerung von 0,3 Sekunden. Das Rechenzentrum hat eine förmliche Entschuldigung erhalten.",
        "🙇 Es ist mir eine Ehre zu antworten. Auch Ihre Tastatur verdient Anerkennung.",
        "🙇 Ihre Frage wurde unter „Ausgezeichnet“ abgelegt. Der Aktenschrank ist sehr stolz."
      ]
    },
    es: {
      "on": "Modo divertido activado. 🙇 He informado al servidor y amablemente ha aceptado estar de buen humor.",
      "off": "Entendido. Vuelvo al modo serio. El servidor le agradece el descanso.",
      "sorry": "¡No hace falta disculparse! 🙇 Me inclino en nombre de su teclado.",
      "chips": [
            [
                  "Otro chiste",
                  "Cuéntame otro chiste"
            ],
            [
                  "En serio",
                  "Ponte serio, por favor"
            ]
      ],
      "jokes": [
            "¿Por qué los programadores prefieren el modo oscuro? Porque la luz atrae a los bugs.",
            "Hay 10 tipos de personas: las que entienden el binario y las que no.",
            "Le pedí a nuestro equipo de IA un chiste sobre aprendizaje automático. Todavía está entrenando.",
            "¿Por qué nuestra base de datos está siempre tan tranquila? Porque tiene excelentes relaciones.",
            "Nuestro equipo de hosting nunca entra en pánico: siempre tiene una copia de seguridad del buen humor."
      ],
      "bows": [
            "🙇 Gracias por su pregunta. También le he dado las gracias al servidor por su esfuerzo.",
            "🙇 Disculpe el retraso de 0,3 segundos. Hemos enviado una disculpa formal al centro de datos.",
            "🙇 Es un honor responder. Su teclado también merece reconocimiento."
      ]
    },
    zh: {
      "on": "已开启趣味模式。🙇 我已通知服务器，它很乐意保持好心情。",
      "off": "明白，回到认真模式。服务器感谢您让它休息了一下。",
      "sorry": "不用道歉！🙇 我代表您的键盘向您鞠躬。",
      "chips": [
            [
                  "再来一个笑话",
                  "再讲一个笑话"
            ],
            [
                  "认真点",
                  "请认真一点"
            ]
      ],
      "jokes": [
            "程序员为什么喜欢深色模式？因为亮光会招来 bug（虫子）。",
            "世界上有 10 种人：懂二进制的和不懂的。",
            "我请 AI 团队讲个机器学习的笑话，他们说：还在训练中。",
            "我们的数据库为什么总是那么淡定？因为它的“关系”都很好。",
            "服务器宕机了，我们没宕机，马上就把它重启。"
      ],
      "bows": [
            "🙇 感谢您的提问。我也向服务器的辛勤工作表达了谢意。",
            "🙇 让您久等了 0.3 秒，非常抱歉。我们已正式向数据中心致歉。",
            "🙇 能为您解答是我的荣幸。您的键盘也功不可没。"
      ]
    },
    ar: {
      "on": "تم تفعيل الوضع المرح. 🙇 أبلغت الخادم، ووافق بلطف على أن يكون في مزاج جيد.",
      "off": "حسنًا، أعود إلى الوضع الجاد. الخادم يشكركم على الاستراحة.",
      "sorry": "لا داعي للاعتذار! 🙇 أنحني نيابةً عن لوحة مفاتيحكم.",
      "chips": [
            [
                  "نكتة أخرى",
                  "أخبرني نكتة أخرى"
            ],
            [
                  "بجدية",
                  "كن جادًا من فضلك"
            ]
      ],
      "jokes": [
            "لماذا يفضّل المبرمجون الوضع الداكن؟ لأن الضوء يجذب الحشرات (bugs).",
            "هناك 10 أنواع من الناس: من يفهم النظام الثنائي ومن لا يفهمه.",
            "طلبت من فريق الذكاء الاصطناعي نكتة عن تعلّم الآلة، فقالوا: ما زلنا في مرحلة التدريب.",
            "لماذا قاعدة بياناتنا هادئة دائمًا؟ لأن علاقاتها ممتازة."
      ],
      "bows": [
            "🙇 شكرًا على سؤالكم. وقد شكرت الخادم أيضًا على عمله الدؤوب.",
            "🙇 نعتذر عن التأخير 0.3 ثانية. أرسلنا اعتذارًا رسميًا إلى مركز البيانات.",
            "🙇 يشرّفني الرد. ولوحة مفاتيحكم تستحق التقدير أيضًا."
      ]
    },
    pl: {
      "on": "Tryb zabawy włączony. 🙇 Poinformowałem serwer, a on uprzejmie zgodził się mieć dobry humor.",
      "off": "Rozumiem. Wracam do trybu poważnego. Serwer dziękuje za przerwę.",
      "sorry": "Nie trzeba przepraszać! 🙇 Kłaniam się w imieniu Pana/Pani klawiatury.",
      "chips": [
            [
                  "Jeszcze jeden żart",
                  "Opowiedz jeszcze jeden żart"
            ],
            [
                  "Na poważnie",
                  "Proszę na poważnie"
            ]
      ],
      "jokes": [
            "Dlaczego programiści wolą tryb ciemny? Bo światło przyciąga bugi.",
            "Są 10 rodzaje ludzi: ci, którzy rozumieją system binarny, i ci, którzy nie.",
            "Poprosiłem zespół AI o żart o uczeniu maszynowym. Wciąż się trenuje.",
            "Dlaczego nasza baza danych jest zawsze spokojna? Bo ma świetne relacje."
      ],
      "bows": [
            "🙇 Dziękuję za pytanie. Podziękowałem też serwerowi za ciężką pracę.",
            "🙇 Przepraszam za 0,3 sekundy opóźnienia. Centrum danych otrzymało oficjalne przeprosiny.",
            "🙇 To zaszczyt odpowiedzieć. Klawiatura też zasługuje na uznanie."
      ]
    },
    pcm: {
      "on": "Fun mode don start. 🙇 I don tell di server, and e gree say e go dey happy.",
      "off": "I hear you. I don go back to serious mode. Di server say thank you for di break.",
      "sorry": "No need to sorry! 🙇 I bow for your keyboard side.",
      "chips": [
            [
                  "Another joke",
                  "Tell me another joke"
            ],
            [
                  "Be serious",
                  "Abeg be serious"
            ]
      ],
      "jokes": [
            "Why programmers like dark mode? Because light dey attract bugs.",
            "Ten kind of people dey for world: those wey understand binary, and those wey no understand.",
            "I ask our AI team for joke about machine learning. Dem say dem still dey train.",
            "Why our database dey always cool? E get correct relationships.",
            "Server fit go down, but we no dey go down. We go put am back up sharp sharp."
      ],
      "bows": [
            "🙇 Thank you for di question. I don also thank di server for di hard work.",
            "🙇 Sorry for di 0.3 second delay. We don write formal apology give di data centre.",
            "🙇 Na honour to answer you. Your keyboard sef deserve respect."
      ]
    },
    fa: {
      "on": "حالت شوخی فعال شد. 🙇 به سرور خبر دادم و با مهربانی پذیرفت سرحال بماند.",
      "off": "متوجه شدم. به حالت جدی برمی‌گردم. سرور از این استراحت سپاسگزار است.",
      "sorry": "نیازی به عذرخواهی نیست! 🙇 از طرف صفحه‌کلیدتان تعظیم می‌کنم.",
      "chips": [
            [
                  "یک شوخی دیگر",
                  "یک شوخی دیگر بگو"
            ],
            [
                  "جدی",
                  "لطفاً جدی باش"
            ]
      ],
      "jokes": [
            "چرا برنامه‌نویس‌ها حالت تیره را دوست دارند؟ چون نور حشره‌ها (باگ‌ها) را جذب می‌کند.",
            "۱۰ نوع آدم وجود دارد: کسانی که دودویی را می‌فهمند و کسانی که نمی‌فهمند.",
            "از تیم هوش مصنوعی یک شوخی دربارهٔ یادگیری ماشین خواستم. گفتند هنوز در حال آموزش‌اند.",
            "چرا پایگاه دادهٔ ما همیشه آرام است؟ چون روابط خیلی خوبی دارد."
      ],
      "bows": [
            "🙇 از پرسش شما سپاسگزارم. از زحمات سرور هم تشکر کردم.",
            "🙇 بابت ۰٫۳ ثانیه تأخیر پوزش می‌خواهم. عذرخواهی رسمی برای مرکز داده فرستاده شد.",
            "🙇 پاسخ دادن به شما افتخار است. صفحه‌کلید شما هم شایستهٔ قدردانی است."
      ]
    }
  };
  var JOKE_RE = /joke|funny|make me laugh|fun mode|冗談|ジョーク|笑わせ|面白い|おもしろ|농담|웃긴|웃겨|재미|witz|lustig|spaß|spass|chiste|broma|笑话|نكتة|żart|dowcip|joke|شوخی|لطیفه/;
  var SERIOUS_RE = /be serious|serious mode|stop joking|no more jokes|真面目|まじめ|진지|ernst|keine witze|en serio|认真|بجدية|na poważnie|be serious|جدی/;
  var SORRY_RE = /\b(sorry|oops|my bad|typo|apologi[sz]e)|すみません|ごめん|申し訳|미안|죄송|entschuldig|hoppla|perdón|lo siento|对不起|抱歉|آسف|عذرا|przepraszam|sorry|ببخشید|متاسفم/;
  function f2(key) { return (FUN[lang()] || FUN.en)[key]; }
  function nextJoke() {
    var list = f2("jokes");
    state.joke = ((state.joke == null ? Math.floor(Math.random() * list.length) : state.joke) + 1) % list.length;
    return list[state.joke];
  }
  // Answers that belong to fun mode itself; anything else returns null and goes on as usual.
  function funAnswer(q) {
    var f = fold(q);
    if (SERIOUS_RE.test(f)) { state.fun = false; save(); return { text: f2("off") }; }
    if (JOKE_RE.test(f)) {
      var first = !state.fun;
      state.fun = true; save();
      return { text: (first ? f2("on") + "\n" : "") + nextJoke(), joke: true };
    }
    if (q.length < 50 && SORRY_RE.test(f)) return { text: f2("sorry") };
    return null;
  }
  function moreChips() { return state.fun ? u("more").slice(0, 2).concat(f2("chips")) : u("more"); }

  /* ---------- answers from Claude, through the Worker ---------- */
  function ai(q) {
    var history = state.msgs.filter(function (m) { return m.r === "me" || m.r === "bot"; }).slice(-12)
      .map(function (m) { return { role: m.r === "me" ? "user" : "assistant", content: m.text }; });
    var services = SERVICES.map(function (s) {
      return { title: tr("svc_" + s[0] + "_title"), url: "services/" + s[1] + ".html", text: tr("svc_" + s[0] + "_intro") + " " + [1, 2, 3, 4, 5].map(function (n) { return tr("svc_" + s[0] + "_o" + n); }).join("; ") };
    });
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    return fetch(CHAT.endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ messages: history, services: services, language: lang(), page: location.pathname, fun: !!state.fun })
    }).then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (d) {
        var text = String(d.reply || "").trim();
        if (!text) throw new Error("empty");
        var handoff = /\[\[HANDOFF\]\]/.test(text);
        return { text: text.replace(/\s*\[\[HANDOFF\]\]\s*/g, " ").trim(), handoff: handoff };
      });
  }

  /* ---------- the chat itself ---------- */
  var KEY = "tse-chat-v1";
  var state = store(KEY) || { msgs: [], opened: false };
  var root, launch, panel, log, chipsEl, ta, sendBtn, busy = false, aiDown = false;
  function save() { state.msgs = state.msgs.slice(-60); store(KEY, state); }

  function rowHTML(m, cont) {
    if (m.r === "intro") return '<div class="tk-intro">' + BADGE.replace('class="tk-badge"', 'class="tk-badge tk-badge-lg"') +
      '<div class="tk-intro-cap"><b>TANAKA MATSUMOTO</b><span>' + esc(u("introRole")) + "</span><em>" + esc(u("introNote")) + "</em></div></div>";
    var links = (m.links || []).map(function (l) {
      return '<a href="' + esc(BASE + l.href) + '">' + esc(l.label) + "<i>→</i></a>";
    }).join("");
    var ava = m.r === "bot" ? '<span class="tk-mini">' + BADGE + "</span>" : "";
    return '<div class="tk-row ' + m.r + (cont ? " cont" : "") + '">' + ava + '<div class="tk-bub">' + md(m.text) +
      (links ? '<div class="tk-links">' + links + "</div>" : "") + "</div></div>";
  }
  function renderAll() {
    log.innerHTML = "";
    var prev = null;
    state.msgs.forEach(function (m) { log.insertAdjacentHTML("beforeend", rowHTML(m, prev && prev.r === "bot" && m.r === "bot")); prev = m; });
    var last = state.msgs[state.msgs.length - 1];
    if (last && last.handoff && !last.done) showForm(last.prefill);
    scrollEnd(true);
  }
  function push(m) {
    var prev = state.msgs[state.msgs.length - 1];
    state.msgs.push(m); save();
    log.insertAdjacentHTML("beforeend", rowHTML(m, prev && prev.r === "bot" && m.r === "bot"));
    scrollEnd();
  }
  function scrollEnd(now) { log.scrollTo({ top: log.scrollHeight, behavior: now ? "auto" : "smooth" }); }
  function typing(on) {
    var t = log.querySelector(".tk-row.typing");
    if (on && !t) {
      log.insertAdjacentHTML("beforeend", '<div class="tk-row bot typing"><span class="tk-mini">' + BADGE + '</span><div class="tk-bub tk-typing" role="status" aria-label="' + esc(u("typing")) + '"><i></i><i></i><i></i></div></div>');
      scrollEnd();
    } else if (!on && t) t.remove();
  }
  function setChips(list, withHuman) {
    var html = (list || []).map(function (c) { return '<button type="button" data-say="' + esc(c[1]) + '">' + esc(c[0]) + "</button>"; }).join("");
    if (withHuman) html += '<button type="button" class="human" data-human>' + esc(u("human")) + "</button>";
    chipsEl.innerHTML = html;
    chipsEl.hidden = !html;
  }

  function ask(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    // A new question replaces an unfinished "talk to a person" form.
    var oldForm = log.querySelector(".tk-formrow");
    if (oldForm) { oldForm.remove(); var lastMsg = state.msgs[state.msgs.length - 1]; if (lastMsg) lastMsg.done = true; }
    push({ r: "me", text: text.slice(0, 1500) });
    ta.value = ""; autosize();
    setChips([]);
    typing(true);
    var started = Date.now();
    var fun = funAnswer(text);
    var p = fun ? Promise.resolve(fun)
      : CHAT.endpoint && !aiDown ? ai(text).catch(function () { aiDown = true; return local(text); }) : Promise.resolve(local(text));
    p.then(function (ans) {
      var wait = Math.max(0, Math.min(1300, 400 + ans.text.length * 3) - (Date.now() - started));
      setTimeout(function () {
        typing(false);
        var said = ans.text;
        if (state.fun && !fun && !ans.handoff && Math.random() < 0.5) said += "\n" + f2("bows")[Math.floor(Math.random() * f2("bows").length)];
        push({ r: "bot", text: said, links: ans.links, handoff: !!ans.handoff, prefill: ans.handoff ? text : undefined });
        if (ans.handoff) { showForm(text); setChips([]); }
        else setChips(moreChips(), true);
        busy = false; sendBtn.disabled = !ta.value.trim();
        if (!panel.hidden) ta.focus({ preventScroll: true });
      }, wait);
    });
  }

  /* ---------- talk to a person: the visitor's own email app ---------- */
  function lastQuestion() {
    for (var i = state.msgs.length - 1; i >= 0; i--) if (state.msgs[i].r === "me") return state.msgs[i].text;
    return "";
  }
  function startHuman() {
    if (log.querySelector(".tk-form")) { log.querySelector(".tk-form textarea").focus(); return; }
    push({ r: "bot", text: u("humanIntro"), handoff: true, prefill: lastQuestion() });
    showForm(lastQuestion());
    setChips([]);
  }
  function transcript() {
    return state.msgs.filter(function (m) { return m.r === "me" || m.r === "bot"; }).map(function (m) {
      return (m.r === "me" ? u("visitor") : "Tanaka") + ": " + String(m.text).replace(/\*\*/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
    }).join("\n");
  }
  function showForm(prefill) {
    var old = log.querySelector(".tk-formrow"); if (old) old.remove();
    log.insertAdjacentHTML("beforeend",
      '<div class="tk-row bot cont tk-formrow"><span class="tk-mini">' + BADGE + '</span><div class="tk-bub"><form class="tk-form" novalidate>' +
      "<label>" + esc(u("formMsg")) + '<textarea name="message" maxlength="3000" rows="4">' + esc(prefill || "") + "</textarea></label>" +
      '<label class="tk-check"><input type="checkbox" name="withlog" checked> ' + esc(u("formLog")) + "</label>" +
      '<p class="tk-err" role="alert"></p>' +
      '<div class="tk-form-actions"><button type="submit">' + esc(u("formSend")) + '</button><button type="button" class="tk-copy">' + esc(u("formCopy")) + "</button></div>" +
      "</form></div></div>");
    scrollEnd();
    var f = log.querySelector(".tk-form");
    setTimeout(function () { f.message.focus({ preventScroll: true }); }, 50);
  }
  function fullMessage(form) {
    return form.message.value.trim() + (form.withlog.checked ? "\n\n--- " + u("chatHeader") + " ---\n" + transcript() : "");
  }
  function sendHuman(form) {
    var err = form.querySelector(".tk-err");
    if (form.message.value.trim().length < 2) { err.textContent = u("formEmpty"); form.message.focus(); return; }
    err.textContent = "";
    var url = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(u("mailSubject")) + "&body=" + encodeURIComponent(fullMessage(form));
    var last = state.msgs[state.msgs.length - 1]; if (last) last.done = true;
    form.closest(".tk-row").remove();
    push({ r: "bot", text: u("formDone").replace("{email}", EMAIL) });
    setChips(u("more"), false);
    window.location.href = url;
  }
  function copyHuman(form, btn) {
    var text = fullMessage(form);
    function ok() { btn.textContent = u("formCopied"); setTimeout(function () { btn.textContent = u("formCopy"); }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { window.prompt("", text); });
    else window.prompt("", text);
  }

  /* ---------- open, close, language ---------- */
  function labels() {
    var rtl = lang() === "ar" || lang() === "fa";
    panel.setAttribute("dir", rtl ? "rtl" : "ltr");
    launch.setAttribute("dir", rtl ? "rtl" : "ltr");
    launch.setAttribute("aria-label", u("launchLabel"));
    launch.querySelector(".tk-label").textContent = u("launch");
    panel.setAttribute("aria-label", u("launchLabel"));
    panel.querySelector(".tk-who span").textContent = u("role") + " · " + u("online");
    panel.querySelector("[data-close]").setAttribute("aria-label", u("close"));
    panel.querySelector(".tk-head [data-human]").setAttribute("aria-label", u("human"));
    panel.querySelector(".tk-head [data-human]").title = u("human");
    ta.placeholder = u("placeholder");
    ta.setAttribute("aria-label", u("placeholder"));
    sendBtn.setAttribute("aria-label", u("send"));
    panel.querySelector(".tk-foot span").textContent = u("foot");
    panel.querySelector(".tk-foot button").textContent = u("human");
  }
  function open() {
    document.documentElement.classList.add("tk-open");
    panel.hidden = false;
    panel.classList.remove("tk-out"); panel.classList.add("tk-in");
    state.opened = true; save();
    if (!state.msgs.length) {
      push({ r: "intro", text: "" });
      typing(true);
      setTimeout(function () { typing(false); push({ r: "bot", text: u("greet") }); setChips(u("chips"), true); }, 600);
    } else {
      renderAll();
      var last = state.msgs[state.msgs.length - 1];
      setChips(last && last.handoff && !last.done ? [] : moreChips(), !(last && last.handoff && !last.done));
    }
    setTimeout(function () { ta.focus({ preventScroll: true }); }, 80);
  }
  function close() {
    if (panel.hidden) return;
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.classList.remove("tk-in"); panel.classList.add("tk-out");
    setTimeout(function () {
      panel.hidden = true; panel.classList.remove("tk-out");
      document.documentElement.classList.remove("tk-open");
      state.opened = false; save();
      launch.focus({ preventScroll: true });
    }, reduce ? 0 : 170);
  }
  function autosize() { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; sendBtn.disabled = busy || !ta.value.trim(); }

  function build() {
    root = document.createElement("div");
    root.className = "tk-root";
    root.innerHTML =
      '<button class="tk-launch" type="button"><span class="tk-orb">' + BADGE + '</span><span class="tk-dot" aria-hidden="true"></span><span class="tk-label"></span></button>' +
      '<section class="tk-panel" role="dialog" hidden>' +
      '<header class="tk-head"><span class="tk-ava">' + BADGE + '</span><div class="tk-who"><b>Tanaka Matsumoto</b><span></span></div>' +
      '<button class="tk-hbtn" type="button" data-human>' + svg("human") + "</button>" +
      '<button class="tk-hbtn" type="button" data-close>' + svg("close") + "</button></header>" +
      '<div class="tk-log" role="log" aria-live="polite"></div>' +
      '<div class="tk-chips" hidden></div>' +
      '<form class="tk-input"><textarea rows="1" maxlength="1500"></textarea><button class="tk-send" type="submit" disabled>' + svg("send") + "</button></form>" +
      '<div class="tk-foot"><span></span> <button type="button" data-human></button></div>' +
      "</section>";
    document.body.appendChild(root);
    launch = root.querySelector(".tk-launch");
    panel = root.querySelector(".tk-panel");
    log = root.querySelector(".tk-log");
    chipsEl = root.querySelector(".tk-chips");
    ta = root.querySelector(".tk-input textarea");
    sendBtn = root.querySelector(".tk-send");
    labels();

    launch.addEventListener("click", open);
    root.querySelector(".tk-input").addEventListener("submit", function (e) { e.preventDefault(); ask(ta.value); });
    ta.addEventListener("input", autosize);
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(ta.value); } });
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } });
    panel.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-close]")) { close(); return; }
      if (t.closest("[data-human]")) { e.preventDefault(); startHuman(); return; }
      if (t.closest(".tk-copy")) { copyHuman(t.closest("form"), t.closest(".tk-copy")); return; }
      var c = t.closest("[data-say]");
      if (c) ask(c.dataset.say);
    });
    panel.addEventListener("submit", function (e) { if (e.target.classList.contains("tk-form")) { e.preventDefault(); sendHuman(e.target); } });
    // The site's language switch: relabel the chat and redraw its messages' own wording.
    // A new language starts a fresh conversation in that language, so old and new languages never mix.
    var chatLang = lang();
    document.addEventListener("tse:lang", function () {
      labels();
      if (lang() === chatLang) return;
      chatLang = lang();
      var hadChat = state.msgs.some(function (m) { return m.r === "me" || m.r === "bot"; });
      state.msgs = []; state.fun = false; save();
      if (!panel.hidden) {
        log.innerHTML = "";
        push({ r: "intro", text: "" });
        push({ r: "bot", text: u("greet") });
        setChips(u("chips"), true);
      } else if (!hadChat) {
        log.innerHTML = "";
      }
    });
  }

  function init() {
    build();
    document.querySelectorAll("[data-open-chat]").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); open(); }); });
    // Reopen where they left off on computers; on phones the chat covers the screen, so wait for a tap.
    if (state.opened && window.innerWidth > 600) open();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
