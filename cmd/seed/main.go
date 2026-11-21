package main

import (
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"social-network/internal/config"
)

var firstNames = []string{
	"Алексей", "Елена", "Дмитрий", "Марина", "Виктор", "Кира", "Артем", "Полина",
	"Степан", "Ксения", "Глеб", "София", "Иван", "Алиса", "Максим", "Яна",
	"Марк", "Милана", "Роман", "Дарья", "Сергей", "Вероника", "Тимофей", "Анастасия",
	"Илья", "Екатерина", "Михаил", "Варвара", "Кирилл", "Валерия", "Никита", "Арина",
	"Владислав", "Ева", "Даниил", "Алена", "Ярослав", "Диана", "Матвей", "Ангелина",
	"Олег", "Маргарита", "Денис", "Виктория", "Антон", "Светлана", "Павел", "Ольга",
	"Егор", "Татьяна",
}

var lastNames = []string{
	"Смирнов", "Васильев", "Волков", "Соколов", "Морозов", "Новиков", "Соловьев", "Кузнецов",
	"Лазарев", "Романов", "Орлов", "Павлов", "Калинин", "Воронов", "Белов", "Фролов",
	"Ковалев", "Ильин", "Гусев", "Титов", "Кузьмин", "Кудрявцев", "Баранов", "Куликов",
	"Алексеев", "Лебедев", "Семенов", "Егоров", "Козлов", "Степанов", "Николаев", "Макаров",
	"Захаров", "Зайцев", "Богданов", "Воронин", "Федоров", "Тарасов", "Беляев", "Комаров",
}

var techBios = []string{
	"Fullstack Go & React инженер. Архитектура распределенных систем и микросервисов.",
	"AI/ML исследователь, исследую трансформеры, LLM и генеративные диффузионные модели.",
	"Synthwave & Cyberpunk продюсер 🎹 Ночные стримы, модульные синтезаторы и саунд-дизайн.",
	"Инженер по кибербезопасности. Реверс-инжиниринг, аудит протоколов и криптография.",
	"UI/UX дизайнер интерфейсов будущего в NeoNet. Минимализм, неон и доступность.",
	"Архитектор децентрализованных систем и графовых баз данных. BFS & PageRank энтузиаст.",
	"Разработчик на Rust и WebAssembly. Высокая производительность и типобезопасность.",
	"DevOps & SRE специалист. Kubernetes, CI/CD пайплайны и мониторинг отказоустойчивости.",
	"Исследователь квантовых коммуникаций и постквантовой криптографии.",
	"Backend инженер в высоконагруженных финтех проектах. PostgreSQL и Kafka мастер.",
	"Геймдев разработчик и энтузиаст процедурной генерации миров.",
	"Специалист по нейросетям и компьютерному зрению. OpenCV, PyTorch и CUDA.",
	"Адепт Open Source, Unix философии и киберпанк эстетики.",
	"Аудио-инженер и разработчик Web Audio API плагинов.",
	"Frontend-архитектор: WebGL шейдеры, Canvas-физика и ультрабыстрый рендеринг.",
}

var statusQuotes = []string{
	"Кодю новый микросервис 💻",
	"Слушаю синтвейв 🎧",
	"В потоке компиляции ⚡",
	"Исследую социальный граф 🌐",
	"Компилирую будущее 🚀",
	"Рефакторю легаси 🔥",
	"На связи в квантовом канале 📡",
	"Медитирую под эмбиент 🧘",
	"Тестирую распределенный консенсус 🛡️",
	"Обучаю новую нейросеть 🧠",
	"Оптимизирую SQL запросы 🏎️",
	"Ночной кодинг на чистом Go 🌙",
	"В поисках чистого звука 🎛️",
	"Деплой в прод прошел успешно ✨",
	"Изучаю криптографические доказательства 🔐",
}

var statusEmojis = []string{"💻", "🎧", "⚡", "🌐", "🚀", "🔥", "📡", "🧘", "🛡️", "🧠", "🏎️", "🌙", "🎛️", "✨", "🔐"}

var ranks = []string{
	"Архитектор Систем",
	"Кибер-Нейромант",
	"Сеньор Бэкендер",
	"Аудио-Продюсер",
	"Квантовый Инженер",
	"Core Contributor",
	"Data Scientist",
	"DevOps Wizard",
	"UI/UX Мастер",
	"Крипто-Аналитик",
	"Сетевой Сталкер",
	"Мастер Алгоритмов",
}

var colors = []string{
	"#00f0ff", "#a855f7", "#10b981", "#f59e0b", "#ec4899",
	"#06b6d4", "#6366f1", "#ef4444", "#3b82f6", "#14b8a6",
	"#8b5cf6", "#f97316", "#eab308", "#84cc16", "#d946ef",
}

var frames = []string{
	"default", "neon-pulse", "cyber-border", "matrix-rain",
	"gold-vip", "fire-glow", "quantum-circle", "glitch-edge",
}

var bgEffects = []string{"none", "grid", "matrix", "cyber-dots", "neon-glow"}

var skillsPool = []string{
	"Golang, Docker, Kubernetes, gRPC",
	"Python, PyTorch, Transformers, LLM",
	"TypeScript, React, WebAudio, Canvas",
	"PostgreSQL, Redis, Kafka, Highload",
	"Rust, WASM, Cryptography, E2EE",
	"UI/UX, Figma, Cyberpunk Styling",
	"Reverse Engineering, OSINT, Security",
	"WebGL, Three.js, Shaders, 3D",
	"Linux Kernel, eBPF, Networking",
	"Distributed Consensus, Raft, Paxos",
}

var postTemplates = []string{
	"Сегодня закончили переход на микросервисную архитектуру через gRPC и Protocol Buffers. Латентность между сервисами упала с 45мс до 1.8мс! 🚀",
	"Попробовал реализовать алгоритм PageRank для взвешивания социального графа пользователей. Коэффициент демпфирования 0.85 показывает потрясающие результаты связности узлов! 🌐",
	"Новый синтвейв сет записан! Чистый аналоговый звук Moog Sub 37 и винтажный Roland Juno-106. Скоро опубликую в канале 🎹✨",
	"Сквозное шифрование на Web Crypto API (X25519 + AES-256-GCM) работает безупречно: все ключи генерируются локально в браузере, а сервер хранит только шифротекст 🛡️🔒",
	"Вышла свежая версия нашего графового Canvas-визуализатора! Теперь частицы взаимодействуют по законам физики Кулона и пружин Гука. Выглядит залипательно ⚛️",
	"Оптимизировали PostgreSQL индексы для поиска по векторам и полнотекстовому поиску на русском языке. Запросы летают мгновенно даже на миллионах строк 🏎️",
	"Запустил федеративный узел на локальном сервере. Протокол ActivityPub и W3C стандарты позволяют бесшовно обмениваться постами между независимыми инстансами! 🪐",
	"Исследую теорию шести рукопожатий на практике с помощью поиска в ширину (BFS). Удивительно, насколько тесен цифровой мир! 🤝",
	"Делюсь свежим треком для продуктивного ночного программирования. Никаких слов, только глубокий эмбиент и неоновый вайб 🎧🌙",
	"Обновили UI личных сообщений: теперь rich link карточки подтягивают превью для YouTube, VK Video, Rutube, TikTok, Twitch и GitHub! Выглядит очень аккуратно ✨",
	"Напоминание всем инженерам: пишите юнит-тесты и профилируйте память с помощью pprof перед каждым важным релизом. Предотвратили утечку горутин еще на стейджинге 🛠️",
	"Кастомизация историй теперь на новом уровне: можно двигать текст вверх/вниз/по центру, менять стиль шрифта на неоновый или пилюлю и настраивать размер стикеров 📸🎨",
	"Социальный капитал в NeoNet теперь рассчитывается автоматически по взвешенному графу взаимодействий. Чем активнее вы делитесь знаниями, тем выше статус узла! 💡",
	"Провёл бенчмарк сериализации: Protobuf оказался в 6 раз быстрее JSON и в 3 раза компактнее по объёму сетевого трафика. Для микросервисов это стандарт де-факто 📊",
	"Интересный факт: алгоритм симметричного шифрования AES-GCM не только шифрует данные, но и гарантирует целостность через аутентификационный тег (AEAD). Никакой подделки на лету 🛡️",
	"Кто еще экспериментирует с локальными моделями через Ollama и llama.cpp? Скорость генерации эмбеддингов на RTX 4090 просто космос 🧠🔥",
	"Задизайнил новый темный киберпанк HUD для профиля: акцентные цвета, неоновые рамки аватара и интерактивные бейджи уровней аккаунта! 🎨💻",
	"Развернули distributed tracing на OpenTelemetry. Теперь каждый RPC вызов виден на ладони от браузерного клика до выполнения SQL в кластере 🔍",
	"Ночная прогулка по виртуальному городу под звуки синт-попа и дождя. Вдохновение для новых открытий найдено 🌃🌧️",
	"Вопрос к сообществу: используете ли вы Kafka или RabbitMQ для асинхронных очередей задач в Go? Поделитесь опытом в комментариях 👇",
}

type ChannelSeed struct {
	Name        string
	Handle      string
	Description string
	AvatarURL   string
}

var channelsToCreate = []ChannelSeed{
	{
		Name:        "Cyber Beats & Radio 📡",
		Handle:      "cyber_beats",
		Description: "Официальный радио-канал синтвейва, киберпанк электроники и ночного эмбиента.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "AI & Deep Learning 🧠",
		Handle:      "neural_ai",
		Description: "Исследования нейросетей, трансформеров, LLM и практические кейсы машинного обучения.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "Golang Highload Club ⚡",
		Handle:      "golang_highload",
		Description: "Высоконагруженные сервисы на Go: gRPC, Protobuf, Kafka, pprof и оптимизация рантайма.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "Night City Tech Hub 🏙️",
		Handle:      "nightcity_tech",
		Description: "Главный хаб технологий будущего, децентрализации и кибернетики.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "Quantum Cryptography & E2EE 🛡️",
		Handle:      "quantum_crypto",
		Description: "Сквозное шифрование, криптографические протоколы, X25519 и постквантовая безопасность.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "Frontend Artisans 🎨",
		Handle:      "frontend_art",
		Description: "Современный веб-инжиниринг: Canvas-физика, WebAudio API, CSS-неон и высокая отзывчивость.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "Distributed Systems & Cloud ☁️",
		Handle:      "distributed_cloud",
		Description: "Распределенные базы данных, алгоритмы консенсуса, Kubernetes и SRE практики.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "Synthwave & Retrowave Lounge 🎹",
		Handle:      "synthwave_lounge",
		Description: "Уютный лаунж для ценителей аналоговых синтезаторов, ретровейва и неоновой эстетики 80-х.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "InfoSec & Reverse Lab 🕵️",
		Handle:      "infosec_lab",
		Description: "Анализ уязвимостей, аудит безопасности смарт-контрактов и реверс-инжиниринг бинарников.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
	{
		Name:        "DevOps & Platform Engineering ☸️",
		Handle:      "devops_pulse",
		Description: "Автоматизация инфраструктуры, GitOps, Helm-чарты, мониторинг Prometheus и Grafana.",
		AvatarURL:   "/static/avatars/default_channel.svg",
	},
}

func main() {
	rand.Seed(time.Now().UnixNano())

	cfg := config.Load()
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBSSLMode)

	log.Printf("[SEED] Подключение к PostgreSQL %s:%s (база: %s)...", cfg.DBHost, cfg.DBPort, cfg.DBName)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Ошибка подключения к БД: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("БД недоступна: %v", err)
	}

	// 1. Подготовка общего хэша пароля "password123"
	passHashBytes, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Ошибка генерации хэша: %v", err)
	}
	passHash := string(passHashBytes)

	// Проверяем текущее количество пользователей
	var currentUsersCount int
	_ = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&currentUsersCount)
	log.Printf("[SEED] Текущее количество пользователей в базе: %d", currentUsersCount)

	// 2. Создаем 100 уникальных пользователей с индивидуальными профилями
	log.Println("[SEED] Генерация 100 уникальных пользователей с индивидуальными профилями...")
	createdUserIDs := make([]int, 0, 100)

	userInsertStmt, err := db.Prepare(`
		INSERT INTO users (
			username, display_name, avatar_url, bio, banner_url,
			status_text, status_emoji, custom_rank, accent_color, avatar_frame,
			profile_bg_effect, skills_tags, social_links, experience_points, account_level,
			password_hash
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10,
			$11, $12, $13, $14, $15,
			$16
		)
		ON CONFLICT (username) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			bio = EXCLUDED.bio,
			status_text = EXCLUDED.status_text,
			status_emoji = EXCLUDED.status_emoji,
			custom_rank = EXCLUDED.custom_rank,
			accent_color = EXCLUDED.accent_color,
			avatar_frame = EXCLUDED.avatar_frame,
			profile_bg_effect = EXCLUDED.profile_bg_effect,
			skills_tags = EXCLUDED.skills_tags,
			account_level = EXCLUDED.account_level,
			experience_points = EXCLUDED.experience_points
		RETURNING id;
	`)
	if err != nil {
		log.Fatalf("Ошибка подготовки запроса добавления пользователя: %v", err)
	}
	defer userInsertStmt.Close()

	avatarStyles := []string{"bottts", "lorelei", "adventurer", "avataaars", "thumbs", "personas"}

	for i := 1; i <= 100; i++ {
		fn := firstNames[rand.Intn(len(firstNames))]
		ln := lastNames[rand.Intn(len(lastNames))]
		dispName := fmt.Sprintf("%s %s", fn, ln)

		uname := fmt.Sprintf("user%03d_%s", i, strings.ToLower(translit(fn)))
		style := avatarStyles[rand.Intn(len(avatarStyles))]
		avatarURL := fmt.Sprintf("https://api.dicebear.com/7.x/%s/svg?seed=%s_%d", style, uname, i)
		bio := techBios[rand.Intn(len(techBios))]
		statusText := statusQuotes[rand.Intn(len(statusQuotes))]
		statusEmoji := statusEmojis[rand.Intn(len(statusEmojis))]
		customRank := ranks[rand.Intn(len(ranks))]
		accentColor := colors[rand.Intn(len(colors))]
		avatarFrame := frames[rand.Intn(len(frames))]
		bgEffect := bgEffects[rand.Intn(len(bgEffects))]
		skills := skillsPool[rand.Intn(len(skillsPool))]
		socials := fmt.Sprintf(`[{"platform":"github","url":"https://github.com/%s"},{"platform":"telegram","url":"https://t.me/%s"}]`, uname, uname)
		level := 1 + rand.Intn(25)
		exp := level * 350 + rand.Intn(200)

		var uid int
		err := userInsertStmt.QueryRow(
			uname, dispName, avatarURL, bio, "",
			statusText, statusEmoji, customRank, accentColor, avatarFrame,
			bgEffect, skills, socials, exp, level,
			passHash,
		).Scan(&uid)
		if err != nil {
			log.Printf("[SEED] Ошибка вставки пользователя %s: %v", uname, err)
			continue
		}
		createdUserIDs = append(createdUserIDs, uid)
	}

	log.Printf("[SEED] Успешно создано/обновлено пользователей: %d", len(createdUserIDs))

	// Загружаем все существующие user ID на случай, если их уже больше
	rows, err := db.Query("SELECT id FROM users ORDER BY id ASC")
	if err == nil {
		allIDs := make([]int, 0)
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err == nil {
				allIDs = append(allIDs, id)
			}
		}
		rows.Close()
		if len(allIDs) > 0 {
			createdUserIDs = allIDs
		}
	}

	if len(createdUserIDs) == 0 {
		log.Fatalf("Нет пользователей для наполнения контентом")
	}

	// 3. Создаем 8-10 каналов для некоторых пользователей
	log.Println("[SEED] Создание публичных каналов...")
	channelIDs := make([]int, 0, len(channelsToCreate))

	chanInsertStmt, err := db.Prepare(`
		INSERT INTO channels (
			creator_id, name, handle, description, avatar_url, subscribers_count
		) VALUES ($1, $2, $3, $4, $5, 1)
		ON CONFLICT (handle) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description
		RETURNING id, creator_id;
	`)
	if err != nil {
		log.Fatalf("Ошибка подготовки запроса каналов: %v", err)
	}
	defer chanInsertStmt.Close()

	type ChanInfo struct {
		ID        int
		CreatorID int
		Name      string
	}
	createdChans := make([]ChanInfo, 0, len(channelsToCreate))

	for i, ch := range channelsToCreate {
		creatorID := createdUserIDs[i%len(createdUserIDs)]
		var chID, actualCreatorID int
		err := chanInsertStmt.QueryRow(creatorID, ch.Name, ch.Handle, ch.Description, ch.AvatarURL).Scan(&chID, &actualCreatorID)
		if err != nil {
			log.Printf("[SEED] Ошибка вставки канала %s: %v", ch.Handle, err)
			continue
		}
		channelIDs = append(channelIDs, chID)
		createdChans = append(createdChans, ChanInfo{ID: chID, CreatorID: actualCreatorID, Name: ch.Name})

		// Создатель канала является админом
		_, _ = db.Exec(`
			INSERT INTO channel_members (channel_id, user_id, role)
			VALUES ($1, $2, 'creator')
			ON CONFLICT (channel_id, user_id) DO NOTHING;
		`, chID, actualCreatorID)
	}
	log.Printf("[SEED] Создано каналов: %d", len(channelIDs))

	// 4. Подписываем пользователей на каналы РАНДОМНО
	log.Println("[SEED] Рандомная подписка пользователей на каналы...")
	memberInsertStmt, _ := db.Prepare(`
		INSERT INTO channel_members (channel_id, user_id, role)
		VALUES ($1, $2, 'subscriber')
		ON CONFLICT (channel_id, user_id) DO NOTHING;
	`)
	if memberInsertStmt != nil {
		defer memberInsertStmt.Close()
	}

	for _, ch := range createdChans {
		// Каждый канал получает от 20 до 60 случайных подписчиков
		subCount := 20 + rand.Intn(40)
		shuffled := make([]int, len(createdUserIDs))
		copy(shuffled, createdUserIDs)
		rand.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })

		subsForThisChan := make([]int, 0, subCount)
		for _, uid := range shuffled {
			if uid == ch.CreatorID {
				continue
			}
			_, err := memberInsertStmt.Exec(ch.ID, uid)
			if err == nil {
				subsForThisChan = append(subsForThisChan, uid)
			}
			if len(subsForThisChan) >= subCount {
				break
			}
		}

		// Обновляем счетчик подписчиков в канале
		_, _ = db.Exec(`
			UPDATE channels SET subscribers_count = (
				SELECT COUNT(*) FROM channel_members WHERE channel_id = $1
			) WHERE id = $1;
		`, ch.ID)

		// Также добавляем несколько входящих сообщений от подписчиков в канал,
		// чтобы в окне сообщений каналов были реальные живые диалоги!
		for msgIdx, subID := range subsForThisChan {
			if msgIdx >= 5 {
				break
			}
			sampleMsg := fmt.Sprintf("Здравствуйте! Очень нравится ваш канал «%s», отличные материалы!", ch.Name)
			if msgIdx == 1 {
				sampleMsg = "Подскажите, пожалуйста, где можно почитать подробнее про стек и используемые технологии?"
			} else if msgIdx == 2 {
				sampleMsg = "Крутой контент! Ждем новых релизов и прямых эфиров 🎧⚡"
			}
			var msgID int
			_ = db.QueryRow(`
				INSERT INTO messages (sender_id, receiver_id, content, channel_id, is_from_channel, created_at)
				VALUES ($1, $2, $3, $4, FALSE, NOW() - ($5 || ' minutes')::INTERVAL)
				RETURNING id;
			`, subID, ch.CreatorID, sampleMsg, ch.ID, (msgIdx+1)*15).Scan(&msgID)

			// Создатель канала отвечает на некоторые сообщения
			if msgIdx%2 == 0 {
				replyMsg := "Спасибо за поддержку! Рады, что вам нравится наш канал. Скоро выйдет новый большой выпуск!"
				_, _ = db.Exec(`
					INSERT INTO messages (sender_id, receiver_id, content, channel_id, is_from_channel, created_at)
					VALUES ($1, $2, $3, $4, TRUE, NOW() - ($5 || ' minutes')::INTERVAL);
				`, ch.CreatorID, subID, replyMsg, ch.ID, (msgIdx+1)*10)
			}
		}
	}

	// 5. Заполняем стену пользователей примерно 100 постами
	log.Println("[SEED] Заполнение стены пользователей ~100 разнообразными постами...")
	postInsertStmt, err := db.Prepare(`
		INSERT INTO posts (
			user_id, content, image_url, music_url, music_title, music_artist,
			likes_count, comments_count, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, NOW() - ($9 || ' hours')::INTERVAL
		) RETURNING id;
	`)
	if err != nil {
		log.Fatalf("Ошибка подготовки запроса постов: %v", err)
	}
	defer postInsertStmt.Close()

	audioTracks := []struct {
		URL    string
		Title  string
		Artist string
	}{
		{"/static/audio/synthwave_neon.mp3", "Neon Horizon (Synthwave Mix)", "CyberPulse"},
		{"/static/audio/cyber_ambient.mp3", "Quantum Dreams (Deep Ambient)", "NeuroSound"},
		{"/static/audio/retrowave_night.mp3", "Night Drive 1984", "RetroGhost"},
		{"", "", ""},
	}

	createdPostIDs := make([]int, 0, 110)
	totalPostsToGenerate := 105

	for i := 0; i < totalPostsToGenerate; i++ {
		authorID := createdUserIDs[i%len(createdUserIDs)]
		template := postTemplates[i%len(postTemplates)]
		content := fmt.Sprintf("%s\n\n#technologies #neonet #update", template)

		var imgURL string
		if i%3 == 1 {
			imgURL = fmt.Sprintf("https://picsum.photos/seed/cyber_%d/800/450", i+100)
		}

		audio := audioTracks[i%len(audioTracks)]
		likesCount := rand.Intn(35)
		commentsCount := rand.Intn(8)
		hoursAgo := (totalPostsToGenerate - i) * 2

		var postID int
		err := postInsertStmt.QueryRow(
			authorID, content, imgURL, audio.URL, audio.Title, audio.Artist,
			likesCount, commentsCount, hoursAgo,
		).Scan(&postID)
		if err == nil {
			createdPostIDs = append(createdPostIDs, postID)
		}
	}

	log.Printf("[SEED] Успешно создано постов на стене: %d", len(createdPostIDs))

	// 6. Добавим немного лайков и комментариев для живости
	log.Println("[SEED] Добавление активности (лайки и комментарии к постам)...")
	likeStmt, _ := db.Prepare(`
		INSERT INTO likes (user_id, post_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, post_id) DO NOTHING;
	`)
	if likeStmt != nil {
		defer likeStmt.Close()
	}

	commentStmt, _ := db.Prepare(`
		INSERT INTO comments (post_id, user_id, content, created_at)
		VALUES ($1, $2, $3, NOW() - ($4 || ' minutes')::INTERVAL);
	`)
	if commentStmt != nil {
		defer commentStmt.Close()
	}

	commentSamples := []string{
		"Отличная архитектура, полностью согласен!",
		"Очень полезный разбор, забираю себе в закладки 📌",
		"Какая латентность на 99-м перцентиле получилась?",
		"Звучит невероятно круто! 🔥",
		"Респект команде за открытость и децентрализованный подход 🚀",
		"Обязательно протестирую на выходных в своем пет-проекте 👍",
	}

	for _, pid := range createdPostIDs {
		// 8-30 реальных лайков от разных пользователей
		numLikes := 8 + rand.Intn(25)
		shuffledUsers := make([]int, len(createdUserIDs))
		copy(shuffledUsers, createdUserIDs)
		rand.Shuffle(len(shuffledUsers), func(i, j int) { shuffledUsers[i], shuffledUsers[j] = shuffledUsers[j], shuffledUsers[i] })
		for lIdx := 0; lIdx < numLikes && lIdx < len(shuffledUsers); lIdx++ {
			_, _ = likeStmt.Exec(shuffledUsers[lIdx], pid)
		}
		_, _ = db.Exec("UPDATE posts SET likes_count = (SELECT COUNT(*) FROM likes WHERE post_id = $1) WHERE id = $1", pid)

		// 1-3 случайных комментария
		numComms := rand.Intn(4)
		for cIdx := 0; cIdx < numComms; cIdx++ {
			cAuthor := createdUserIDs[rand.Intn(len(createdUserIDs))]
			cText := commentSamples[rand.Intn(len(commentSamples))]
			_, _ = commentStmt.Exec(pid, cAuthor, cText, rand.Intn(180)+5)
		}
		_, _ = db.Exec("UPDATE posts SET comments_count = (SELECT COUNT(*) FROM comments WHERE post_id = $1) WHERE id = $1", pid)
	}

	log.Println("[SEED] 🌟 Заполнение базы успешно завершено!")
	log.Printf("[SEED] Всего пользователей: %d | Постов: %d | Каналов: %d", len(createdUserIDs), len(createdPostIDs), len(createdChans))
}

func translit(s string) string {
	mapping := map[rune]string{
		'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'е': "e", 'ё': "yo",
		'ж': "zh", 'з': "z", 'и': "i", 'й': "y", 'к': "k", 'л': "l", 'м': "m",
		'н': "n", 'о': "o", 'п': "p", 'р': "r", 'с': "s", 'т': "t", 'у': "u",
		'ф': "f", 'х': "kh", 'ц': "ts", 'ч': "ch", 'ш': "sh", 'щ': "sch",
		'ъ': "", 'ы': "y", 'ь': "", 'э': "e", 'ю': "yu", 'я': "ya",
		'А': "a", 'Б': "b", 'В': "v", 'Г': "g", 'Д': "d", 'Е': "e", 'Ё': "yo",
		'Ж': "zh", 'З': "z", 'И': "i", 'Й': "y", 'К': "k", 'Л': "l", 'М': "m",
		'Н': "n", 'О': "o", 'П': "p", 'Р': "r", 'С': "s", 'Т': "t", 'У': "u",
		'Ф': "f", 'Х': "kh", 'Ц': "ts", 'Ч': "ch", 'Ш': "sh", 'Щ': "sch",
		'Ъ': "", 'Ы': "y", 'Ь': "", 'Э': "e", 'Ю': "yu", 'Я': "ya",
	}
	var res string
	for _, r := range s {
		if val, ok := mapping[r]; ok {
			res += val
		} else if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			res += string(r)
		}
	}
	if res == "" {
		res = "user"
	}
	return res
}
