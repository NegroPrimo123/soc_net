package database

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"social-network/internal/config"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

func InitDB(cfg *config.Config) (*sql.DB, error) {
	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBSSLMode,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Настройка пула подключений к PostgreSQL для высокой нагрузки и низких задержек
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Successfully connected to PostgreSQL database:", cfg.DBName)

	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	if err := seed(db); err != nil {
		log.Printf("Warning: failed to seed initial data: %v\n", err)
	}

	return db, nil
}

func migrate(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		username VARCHAR(50) UNIQUE NOT NULL,
		display_name VARCHAR(100) NOT NULL,
		avatar_url TEXT DEFAULT '',
		bio TEXT DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS posts (
		id SERIAL PRIMARY KEY,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		content TEXT NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS likes (
		id SERIAL PRIMARY KEY,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		UNIQUE(user_id, post_id)
	);

	CREATE TABLE IF NOT EXISTS comments (
		id SERIAL PRIMARY KEY,
		post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		content TEXT NOT NULL,
		is_edited BOOLEAN DEFAULT FALSE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);
	ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
	ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

	CREATE TABLE IF NOT EXISTS follows (
		follower_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		following_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		PRIMARY KEY (follower_id, following_id)
	);

	CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
	CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
	CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

	ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count INT DEFAULT 0;
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0;
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS music_url TEXT DEFAULT '';
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS music_title VARCHAR(255) DEFAULT '';
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS music_artist VARCHAR(255) DEFAULT '';

	ALTER TABLE users ADD COLUMN IF NOT EXISTS music_url TEXT DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS music_title VARCHAR(255) DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS music_artist VARCHAR(255) DEFAULT '';

	CREATE TABLE IF NOT EXISTS user_music (
		id SERIAL PRIMARY KEY,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		url TEXT NOT NULL,
		title VARCHAR(255) NOT NULL,
		artist VARCHAR(255) DEFAULT '',
		position INT NOT NULL DEFAULT 0,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);
	ALTER TABLE user_music ADD COLUMN IF NOT EXISTS position INT DEFAULT 0;
	CREATE INDEX IF NOT EXISTS idx_user_music_user_id ON user_music(user_id, position ASC, id DESC);

	INSERT INTO user_music (user_id, url, title, artist)
	SELECT id, music_url, music_title, music_artist
	FROM users
	WHERE music_url != '' AND NOT EXISTS (
		SELECT 1 FROM user_music WHERE user_music.user_id = users.id AND user_music.url = users.music_url
	);


	ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS status_text TEXT DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS status_emoji VARCHAR(20) DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_rank VARCHAR(100) DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color VARCHAR(30) DEFAULT '#00f0ff';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_frame VARCHAR(50) DEFAULT 'default';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_bg_effect VARCHAR(50) DEFAULT 'none';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS skills_tags TEXT DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links TEXT DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_gift_id INT DEFAULT 0;
	ALTER TABLE users ALTER COLUMN status_emoji TYPE VARCHAR(100);
	ALTER TABLE users ALTER COLUMN avatar_frame TYPE VARCHAR(255);

	CREATE TABLE IF NOT EXISTS sessions (
		token VARCHAR(64) PRIMARY KEY,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		expires_at TIMESTAMP WITH TIME ZONE NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

	-- Таблица интерактивных цифровых подарков («Цветные карандаши»)
	CREATE TABLE IF NOT EXISTS gifts (
		id SERIAL PRIMARY KEY,
		sender_id INT REFERENCES users(id) ON DELETE SET NULL,
		receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		gift_type VARCHAR(50) NOT NULL,
		message TEXT DEFAULT '',
		is_anonymous BOOLEAN DEFAULT FALSE,
		is_hidden BOOLEAN DEFAULT FALSE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);
	ALTER TABLE gifts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
	CREATE INDEX IF NOT EXISTS idx_gifts_receiver_id ON gifts(receiver_id);
	CREATE INDEX IF NOT EXISTS idx_gifts_sender_id ON gifts(sender_id);
	CREATE INDEX IF NOT EXISTS idx_gifts_hidden ON gifts(receiver_id, is_hidden);
	CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

	-- Таблица личных сообщений между пользователями (Direct Messages)
	CREATE TABLE IF NOT EXISTS messages (
		id SERIAL PRIMARY KEY,
		sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		content TEXT NOT NULL,
		is_read BOOLEAN DEFAULT FALSE,
		is_edited BOOLEAN DEFAULT FALSE,
		deleted_for_sender BOOLEAN DEFAULT FALSE,
		deleted_for_receiver BOOLEAN DEFAULT FALSE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_sender BOOLEAN DEFAULT FALSE;
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_receiver BOOLEAN DEFAULT FALSE;
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_url TEXT DEFAULT '';
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_title VARCHAR(255) DEFAULT '';
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_artist VARCHAR(255) DEFAULT '';

	CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
	CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
	CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id, created_at ASC);
	CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

	-- Реакции на личные сообщения (Message Reactions)
	CREATE TABLE IF NOT EXISTS message_reactions (
		id SERIAL PRIMARY KEY,
		message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		emoji VARCHAR(32) NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		UNIQUE(message_id, user_id, emoji)
	);
	CREATE INDEX IF NOT EXISTS idx_message_reactions_msg_id ON message_reactions(message_id);

	-- Таблица системы уведомлений с поддержкой группировки событий
	CREATE TABLE IF NOT EXISTS notifications (
		id SERIAL PRIMARY KEY,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		actor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		action_type VARCHAR(50) NOT NULL,
		target_id INT DEFAULT 0,
		content TEXT DEFAULT '',
		is_read BOOLEAN DEFAULT FALSE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

	-- =========================================================
	-- КАНАЛЫ (CHANNELS)
	-- =========================================================
	CREATE TABLE IF NOT EXISTS channels (
		id SERIAL PRIMARY KEY,
		creator_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name VARCHAR(100) NOT NULL,
		handle VARCHAR(60) UNIQUE NOT NULL,
		description TEXT DEFAULT '',
		avatar_url TEXT DEFAULT '/static/avatars/default_channel.svg',
		banner_url TEXT DEFAULT '',
		subscribers_count INT DEFAULT 1,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS idx_channels_handle ON channels(handle);
	CREATE INDEX IF NOT EXISTS idx_channels_creator_id ON channels(creator_id);
	CREATE INDEX IF NOT EXISTS idx_channels_created_at ON channels(created_at DESC);

	CREATE TABLE IF NOT EXISTS channel_members (
		id SERIAL PRIMARY KEY,
		channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		role VARCHAR(20) DEFAULT 'member',
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		UNIQUE(channel_id, user_id)
	);
	CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON channel_members(channel_id);
	CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON channel_members(user_id);

	-- =========================================================
	-- ОПРОСЫ И ГОЛОСОВАНИЯ (POLLS & VOTES)
	-- =========================================================
	CREATE TABLE IF NOT EXISTS polls (
		id SERIAL PRIMARY KEY,
		creator_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		question TEXT NOT NULL,
		is_multiple BOOLEAN DEFAULT FALSE,
		is_anonymous BOOLEAN DEFAULT FALSE,
		total_votes INT DEFAULT 0,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);
	ALTER TABLE polls ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;
	CREATE INDEX IF NOT EXISTS idx_polls_creator_id ON polls(creator_id);

	CREATE TABLE IF NOT EXISTS poll_options (
		id SERIAL PRIMARY KEY,
		poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
		text TEXT NOT NULL,
		votes_count INT DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id ON poll_options(poll_id);

	CREATE TABLE IF NOT EXISTS poll_votes (
		id SERIAL PRIMARY KEY,
		poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
		option_id INT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		UNIQUE(poll_id, user_id, option_id)
	);
	CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id);
	CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id);

	-- Связка постов с каналами и опросами
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS channel_id INT REFERENCES channels(id) ON DELETE CASCADE;
	ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_id INT REFERENCES polls(id) ON DELETE SET NULL;
	CREATE INDEX IF NOT EXISTS idx_posts_channel_id ON posts(channel_id);
	CREATE INDEX IF NOT EXISTS idx_posts_poll_id ON posts(poll_id);

	-- Связка сообщений с каналами и опросами (Анонимные личные сообщения с каналом)
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id INT REFERENCES channels(id) ON DELETE CASCADE;
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_from_channel BOOLEAN DEFAULT FALSE;
	ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id INT REFERENCES polls(id) ON DELETE SET NULL;
	CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
	CREATE INDEX IF NOT EXISTS idx_messages_poll_id ON messages(poll_id);

	UPDATE users SET password_hash = '$2b$10$VjKN/Wou1MxkZTTqqCfI9u1fx13uG6DbuQkSY1L6Emy2ZwpazYsE6' WHERE password_hash = '' OR password_hash IS NULL;

	-- Миграция подарков на коллекцию из 9 Cyberpunk 3D-подарков (без фона)
	UPDATE gifts SET gift_type = 'cyber_katana' WHERE gift_type IN ('black_ice', 'cute_kitten', 'cyber_unicorn');
	UPDATE gifts SET gift_type = 'neuro_visor' WHERE gift_type IN ('gentle_bouquet', 'quantum_diamond');
	UPDATE gifts SET gift_type = 'quantum_heart' WHERE gift_type IN ('cyber_heart', 'festive_box', 'supernova');
	UPDATE gifts SET gift_type = 'samurai_helmet' WHERE gift_type IN ('cyber_skull', 'bear_heart', 'quantum_crown');
	UPDATE gifts SET gift_type = 'synthwave_cassette' WHERE gift_type IN ('cozy_cup', 'moon_rocket');
	UPDATE gifts SET gift_type = 'tactical_drone' WHERE gift_type IN ('cyber_drone');
	UPDATE gifts SET gift_type = 'combat_stim' WHERE gift_type IN ('neuro_stimulator', 'infinite_coffee');

	UPDATE posts p SET comments_count = (SELECT count(1) FROM comments c WHERE c.post_id = p.id)
	WHERE p.comments_count = 0 AND EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id);

	-- Очищаем встроенные синтетические пресеты, чтобы музыка была ТОЛЬКО пользовательской
	UPDATE users SET music_url = '', music_title = '', music_artist = ''
	WHERE music_url LIKE '/static/audio/%';

	UPDATE posts SET music_url = '', music_title = '', music_artist = ''
	WHERE music_url LIKE '/static/audio/%';

	-- Полнотекстовый поиск с морфологией и триграммами (FTS + pg_trgm)
	CREATE EXTENSION IF NOT EXISTS pg_trgm;

	DO $$ 
	BEGIN 
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns 
			WHERE table_name='posts' AND column_name='search_vector'
		) THEN
			ALTER TABLE posts ADD COLUMN search_vector tsvector 
			GENERATED ALWAYS AS (to_tsvector('russian', content)) STORED;
		END IF;
	END $$;

	CREATE INDEX IF NOT EXISTS idx_posts_search_vector ON posts USING gin(search_vector);
	CREATE INDEX IF NOT EXISTS idx_posts_content_trgm ON posts USING gin(content gin_trgm_ops);

	-- =========================================================
	-- ДОСТИЖЕНИЯ И ГЕЙМИФИКАЦИЯ (ACHIEVEMENTS & GAMIFICATION)
	-- =========================================================
	CREATE TABLE IF NOT EXISTS achievements (
		id VARCHAR(50) PRIMARY KEY,
		title VARCHAR(100) NOT NULL,
		description TEXT NOT NULL,
		category VARCHAR(50) NOT NULL,
		rarity VARCHAR(20) NOT NULL DEFAULT 'common',
		icon VARCHAR(50) NOT NULL,
		points INT NOT NULL DEFAULT 10,
		target_count INT NOT NULL DEFAULT 1,
		sort_order INT NOT NULL DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS user_achievements (
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		achievement_id VARCHAR(50) NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
		progress INT NOT NULL DEFAULT 0,
		is_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
		unlocked_at TIMESTAMP WITH TIME ZONE,
		PRIMARY KEY (user_id, achievement_id)
	);
	CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id, is_unlocked);

	ALTER TABLE users ADD COLUMN IF NOT EXISTS experience_points INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS account_level INT NOT NULL DEFAULT 1;

	INSERT INTO achievements (id, title, description, category, rarity, icon, points, target_count, sort_order) VALUES
		('first_post', 'Первый шаг в Найт-Сити', 'Опубликуйте свою первую запись в ленте', 'content', 'common', '📝', 15, 1, 1),
		('first_comment', 'Слово за слово', 'Оставьте первый комментарий к любой публикации', 'social', 'common', '💬', 10, 1, 2),
		('first_follow', 'Нейро-Связь', 'Подпишитесь на любого жителя Найт-Сити', 'social', 'common', '🤝', 10, 1, 3),
		('give_likes_5', 'Сердечный импульс', 'Поставьте 5 лайков понравившимся записям', 'social', 'common', '❤️', 15, 5, 4),
		('vote_poll_1', 'Голос улиц', 'Примите участие в голосовании любого опроса', 'polls', 'common', '📊', 15, 1, 5),
		('profile_custom', 'Свой стиль', 'Настройте неоновую рамку, ауру или статус профиля', 'profile', 'common', '🎨', 20, 1, 6),
		('profile_music', 'Синтвейв в эфире', 'Установите любимый аудиотрек в свой профиль', 'profile', 'common', '🎵', 20, 1, 7),
		('sub_channel_1', 'Информационный поток', 'Подпишитесь хотя бы на один тематический канал', 'channels', 'common', '📢', 15, 1, 8),
		('send_gift_1', 'Теплый жест', 'Подарите цифровой киберпанк-артефакт другому пользователю', 'gifts', 'common', '🎁', 25, 1, 9),
		('channel_dm_1', 'Анонимный связной', 'Отправьте анонимное сообщение в диалог с каналом', 'channels', 'common', '🕵️', 20, 1, 10),
		('posts_10', 'Летописец Найт-Сити', 'Опубликуйте 10 записей в ленте или своих каналах', 'content', 'rare', '📚', 60, 10, 11),
		('comments_25', 'Мастер дискуссий', 'Напишите 25 комментариев под публикациями', 'social', 'rare', '🗣️', 80, 25, 12),
		('likes_received_5', 'В лучах неона', 'Соберите суммарно 5 лайков на своих публикациях', 'content', 'rare', '⭐', 70, 5, 13),
		('create_channel_1', 'Медиа-Магнат', 'Создайте свой собственный публичный канал', 'channels', 'rare', '🛰️', 75, 1, 14),
		('channel_subs_3', 'Лидер мнений', 'Привлеките 3 подписчиков в свой авторский канал', 'channels', 'rare', '👥', 90, 3, 15),
		('gifts_received_3', 'Коллекционер Реликвий', 'Получите 3 кибер-подарка от других жителей сети', 'gifts', 'rare', '🏆', 85, 3, 16),
		('create_polls_3', 'Инициатор дебатов', 'Создайте 3 публикации с интерактивными опросами', 'polls', 'rare', '📈', 65, 3, 17),
		('level_5_reach', 'Истинный Нетраннер', 'Прокачайте аккаунт и достигните 5-го уровня профиля', 'level', 'legendary', '⚡', 150, 5, 18),
		('veteran_achievements_10', 'Легенда Найт-Сити', 'Разблокируйте как минимум 10 любых достижений платформы', 'level', 'legendary', '👑', 250, 10, 19)
	ON CONFLICT (id) DO UPDATE SET
		title = EXCLUDED.title,
		description = EXCLUDED.description,
		category = EXCLUDED.category,
		rarity = EXCLUDED.rarity,
		icon = EXCLUDED.icon,
		points = EXCLUDED.points,
		target_count = EXCLUDED.target_count,
		sort_order = EXCLUDED.sort_order;
	`

	_, err := db.Exec(schema)
	if err != nil {
		return err
	}
	log.Println("Database schema migrations applied successfully.")
	return nil
}

func seed(db *sql.DB) error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		return err
	}

	var giftsCount int
	err = db.QueryRow("SELECT COUNT(*) FROM gifts").Scan(&giftsCount)
	if err == nil && giftsCount == 0 {
		giftsSQL := `
		INSERT INTO gifts (sender_id, receiver_id, gift_type, message, is_anonymous, created_at) VALUES
		(2, 1, 'cyber_katana', 'Лазерная катана для легенды Найт-Сити! 🗡️✨', false, NOW() - INTERVAL '2 hours'),
		(3, 1, 'quantum_heart', 'Термоядерное кибер-сердце за невероятную платформу! ⚡❤️', false, NOW() - INTERVAL '1 hour 45 minutes'),
		(2, 1, 'samurai_helmet', 'Боевой они-шлем самурая за чистейший код! 🤖🔥', true, NOW() - INTERVAL '1 hour 20 minutes'),
		(1, 2, 'neuro_visor', 'Тактический визор для полного контроля над серверами! 🕶️🌐', false, NOW() - INTERVAL '1 hour'),
		(1, 3, 'synthwave_cassette', 'Синтвейв ритмы для непревзойденного дизайна! 💾🎵', false, NOW() - INTERVAL '45 minutes'),
		(2, 3, 'mantis_blade', 'Клинок богомола для молниеносной резки багов! 🦾⚡', false, NOW() - INTERVAL '30 minutes'),
		(3, 2, 'tactical_drone', 'Стелс-дрон для круглосуточного мониторинга! 🛸📡', false, NOW() - INTERVAL '20 minutes'),
		(1, 2, 'emp_grenade', 'ЭМИ-граната для нейтрализации сбоев сети! 💣⚡', false, NOW() - INTERVAL '15 minutes'),
		(2, 1, 'combat_stim', 'Боевой нейро-инжектор MaxDoc для сверхпродуктивности! 💉🔋', false, NOW() - INTERVAL '5 minutes')
		ON CONFLICT DO NOTHING;
		`
		_, _ = db.Exec(giftsSQL)
	}

	var messagesCount int
	err = db.QueryRow("SELECT COUNT(*) FROM messages").Scan(&messagesCount)
	if err == nil && messagesCount == 0 {
		messagesSQL := `
		INSERT INTO messages (sender_id, receiver_id, content, is_read, created_at) VALUES
		(2, 1, 'Привет, Олег! Посмотрел твои последние коммиты, всё работает отлично!', true, NOW() - INTERVAL '3 hours'),
		(1, 2, 'Привет, Алексей! Спасибо! База данных отвечает за считанные миллисекунды.', true, NOW() - INTERVAL '2 hours 50 minutes'),
		(2, 1, 'Деплой готов, PostgreSQL запущен в контейнере, все миграции накатились без ошибок.', true, NOW() - INTERVAL '2 hours 40 minutes'),
		(3, 1, 'Олег, привет! Я подготовила новую цветовую гамму и коллекцию подарков. Выглядит очень уютно!', false, NOW() - INTERVAL '45 minutes'),
		(1, 3, 'Привет, София! Здорово, сейчас протестирую отправку подарков и уведомления.', true, NOW() - INTERVAL '30 minutes'),
		(3, 1, 'Супер, жду обратной связи! Не забудь оценить новые анимации 🎨', false, NOW() - INTERVAL '10 minutes')
		ON CONFLICT DO NOTHING;
		`
		_, _ = db.Exec(messagesSQL)
	}

	var notificationsCount int
	err = db.QueryRow("SELECT COUNT(*) FROM notifications").Scan(&notificationsCount)
	if err == nil && notificationsCount == 0 {
		notifSQL := `
		INSERT INTO notifications (user_id, actor_id, action_type, target_id, content, is_read, created_at) VALUES
		(1, 2, 'like', 1, '', false, NOW() - INTERVAL '25 minutes'),
		(1, 3, 'like', 1, '', false, NOW() - INTERVAL '20 minutes'),
		(1, 3, 'comment', 1, 'Поздравляю с релизом платформы! 🎉', false, NOW() - INTERVAL '18 minutes'),
		(1, 2, 'follow', 1, '', false, NOW() - INTERVAL '15 minutes'),
		(1, 3, 'gift', 1, 'bear_heart', false, NOW() - INTERVAL '10 minutes')
		ON CONFLICT DO NOTHING;
		`
		_, _ = db.Exec(notifSQL)
	}

	// Обеспечиваем наличие пользователя Итаква (Identity V)
	var itakwaExists bool
	_ = db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = 'itakwa')").Scan(&itakwaExists)
	if !itakwaExists {
		itakHash, _ := bcrypt.GenerateFromPassword([]byte("123123"), bcrypt.DefaultCost)
		_, _ = db.Exec(`
			INSERT INTO users (
				username, display_name, password_hash, avatar_url, banner_url, bio,
				status_text, status_emoji, custom_rank, accent_color, avatar_frame,
				profile_bg_effect, skills_tags, social_links, pinned_gift_id
			) VALUES (
				'itakwa', 'Итаква • Night Watch', $1,
				'/uploads/ithaqua_1fb3a18e3859fc2e3465550920a07806.jpg',
				'/uploads/ithaqua_6388aa602b3b6e36c0ccba4e32cd82dd.jpg',
				'Ночной Дозорный (Night Watch) • Охотник Поместья Олетис (Identity V). Владыка ледяных ветров и безжалостных метелей. Тот, кто бесшумно шагает сквозь свирепую зимнюю бурю на острых ходулях, ведомый плачем замерзшей матери. «Тише... слышишь, как завывает северный ветер?»',
				'❄️ Метель уже близко... Я слышу твой шаг.', '❄️',
				'Ледяной Страж • Ночной Дозорный (Identity V)',
				'#38bdf8', 'night-watch', 'arctic-blizzard',
				'Identity V, Охотник, Ночной Дозорный, Поступь Ветра, Циклон, Метель, Олетис',
				'{"web":"https://idv.163.com","discord":"Ithaqua#0001"}', 1
			) ON CONFLICT DO NOTHING
		`, string(itakHash))
	} else {
		// Автоматическая защита: восстанавливаем каноничный облик Итаквы при повреждении
		_, _ = db.Exec(`
			UPDATE users SET
				display_name = 'Итаква • Night Watch',
				avatar_url = CASE WHEN avatar_url LIKE '%oleg%' OR avatar_url = '' OR avatar_url LIKE '%default%' THEN '/uploads/ithaqua_1fb3a18e3859fc2e3465550920a07806.jpg' ELSE avatar_url END,
				banner_url = CASE WHEN banner_url = '' THEN '/uploads/ithaqua_6388aa602b3b6e36c0ccba4e32cd82dd.jpg' ELSE banner_url END,
				custom_rank = CASE WHEN custom_rank = '' OR custom_rank LIKE '%Элитный%' THEN 'Ледяной Страж • Ночной Дозорный (Identity V)' ELSE custom_rank END,
				avatar_frame = CASE WHEN avatar_frame = '' OR avatar_frame = 'default' THEN 'night-watch' ELSE avatar_frame END,
				music_url = CASE WHEN music_url = '' OR music_url IS NULL THEN '/static/audio/ithaqua_night_watch.wav' ELSE music_url END,
				music_title = CASE WHEN music_title = '' OR music_title IS NULL THEN 'Whispering Blizzard (Gothic Ambient)' ELSE music_title END,
				music_artist = CASE WHEN music_artist = '' OR music_artist IS NULL THEN 'Итаква • Night Watch' ELSE music_artist END,
				profile_bg_effect = CASE WHEN profile_bg_effect = '' OR profile_bg_effect = 'none' THEN 'arctic-blizzard' ELSE profile_bg_effect END,
				bio = CASE WHEN bio = '' THEN 'Ночной Дозорный (Night Watch) • Охотник Поместья Олетис (Identity V). Владыка ледяных ветров и безжалостных метелей. Тот, кто бесшумно шагает сквозь свирепую зимнюю бурю на острых ходулях, ведомый плачем замерзшей матери. «Тише... слышишь, как завывает северный ветер?»' ELSE bio END
			WHERE LOWER(username) = 'itakwa' AND (display_name LIKE '%Олег%' OR display_name = 'itakwa' OR custom_rank = '')
		`)
	}

	if count > 0 {
		return nil // Already seeded
	}

	seedSQL := `
	INSERT INTO users (username, display_name, password_hash, avatar_url, bio) VALUES
	('oleg', 'Олег Смирнов', '$2a$10$QO0YI/9wR.PfvP6u7.7H2.dZ/3X1n705bC11E2hQW615RzGk2iK6u', '/static/avatars/oleg.svg', 'Разработчик Go & Архитектор систем. Строю соцсеть с нуля! 🚀'),
	('alex', 'Алексей Ковалев', '$2a$10$QO0YI/9wR.PfvP6u7.7H2.dZ/3X1n705bC11E2hQW615RzGk2iK6u', '/static/avatars/alex.svg', 'DevOps & Cloud инженер. Люблю микросервисы и чистый код.'),
	('sophia', 'София Романова', '$2a$10$QO0YI/9wR.PfvP6u7.7H2.dZ/3X1n705bC11E2hQW615RzGk2iK6u', '/static/avatars/sophia.svg', 'UI/UX дизайнер и фронтенд-энтузиаст. Делаю интерфейсы уютными и удобными.')
	ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;


	INSERT INTO posts (user_id, content, created_at) VALUES
	(1, 'Привет всем! Это первый пост в нашей обновленной социальной сети на Go + PostgreSQL! ⚡🚀', NOW() - INTERVAL '3 hours'),
	(2, 'PostgreSQL 15 в связке с Go работает молниеносно. Задержка запросов менее 2 миллисекунд!', NOW() - INTERVAL '2 hours'),
	(3, 'Интерфейс выглядит очень тепло и современно. Давайте протестируем новую коллекцию подарков!', NOW() - INTERVAL '1 hour');

	INSERT INTO follows (follower_id, following_id) VALUES
	(1, 2),
	(1, 3),
	(2, 1),
	(3, 1)
	ON CONFLICT DO NOTHING;

	INSERT INTO likes (user_id, post_id) VALUES
	(2, 1),
	(3, 1),
	(1, 2)
	ON CONFLICT DO NOTHING;

	INSERT INTO comments (post_id, user_id, content) VALUES
	(1, 2, 'Отличный старт! Архитектура выглядит очень надежной.'),
	(1, 3, 'Поздравляю с релизом платформы! 🎉'),
	(2, 1, 'Полностью согласен, пул соединений database/sql отрабатывает превосходно.');
	`

	_, err = db.Exec(seedSQL)
	if err != nil {
		return err
	}

	// Установка начальных музыкальных треков для пользователей
	_, _ = db.Exec(`
		UPDATE users SET
			music_url = CASE 
				WHEN LOWER(username) = 'oleg' AND (music_url = '' OR music_url IS NULL) THEN '/static/audio/cyber_neon_drift.wav'
				WHEN LOWER(username) = 'sophia' AND (music_url = '' OR music_url IS NULL) THEN '/static/audio/lofi_midnight_rain.wav'
				WHEN LOWER(username) = 'alex' AND (music_url = '' OR music_url IS NULL) THEN '/static/audio/retro_arcade_pulse.wav'
				WHEN LOWER(username) = 'itakwa' AND (music_url = '' OR music_url IS NULL) THEN '/static/audio/ithaqua_night_watch.wav'
				ELSE music_url
			END,
			music_title = CASE 
				WHEN LOWER(username) = 'oleg' AND (music_title = '' OR music_title IS NULL) THEN 'Neon Drift (Synthwave 2077)'
				WHEN LOWER(username) = 'sophia' AND (music_title = '' OR music_title IS NULL) THEN 'Midnight Rain (Lofi Beats)'
				WHEN LOWER(username) = 'alex' AND (music_title = '' OR music_title IS NULL) THEN 'Arcade Pulse (Chiptune)'
				WHEN LOWER(username) = 'itakwa' AND (music_title = '' OR music_title IS NULL) THEN 'Whispering Blizzard (Gothic Ambient)'
				ELSE music_title
			END,
			music_artist = CASE 
				WHEN LOWER(username) = 'oleg' AND (music_artist = '' OR music_artist IS NULL) THEN 'Олег Кибер-Пилот'
				WHEN LOWER(username) = 'sophia' AND (music_artist = '' OR music_artist IS NULL) THEN 'Sophia'
				WHEN LOWER(username) = 'alex' AND (music_artist = '' OR music_artist IS NULL) THEN 'Alex NetRunner'
				WHEN LOWER(username) = 'itakwa' AND (music_artist = '' OR music_artist IS NULL) THEN 'Итаква • Night Watch'
				ELSE music_artist
			END
		WHERE LOWER(username) IN ('oleg', 'sophia', 'alex', 'itakwa');

		UPDATE posts SET 
			music_url = '/static/audio/cyber_neon_drift.wav',
			music_title = 'Neon Drift (Synthwave 2077)',
			music_artist = 'Олег Кибер-Пилот'
		WHERE id = 1 AND (music_url = '' OR music_url IS NULL);
	`)

	log.Println("Initial sample data seeded successfully.")
	return nil
}
