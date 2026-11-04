package database

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"social-network/internal/config"

	_ "github.com/lib/pq"
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
	CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
	CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
	CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id, created_at ASC);
	CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

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

	UPDATE users SET password_hash = '$2b$10$VjKN/Wou1MxkZTTqqCfI9u1fx13uG6DbuQkSY1L6Emy2ZwpazYsE6' WHERE password_hash = '' OR password_hash IS NULL;

	-- Миграция подарков на коллекцию из 9 Cyberpunk 3D-подарков (без фона)
	UPDATE gifts SET gift_type = 'cyber_katana' WHERE gift_type IN ('black_ice', 'cute_kitten', 'cyber_unicorn');
	UPDATE gifts SET gift_type = 'neuro_visor' WHERE gift_type IN ('gentle_bouquet', 'quantum_diamond');
	UPDATE gifts SET gift_type = 'quantum_heart' WHERE gift_type IN ('cyber_heart', 'festive_box', 'supernova');
	UPDATE gifts SET gift_type = 'samurai_helmet' WHERE gift_type IN ('cyber_skull', 'bear_heart', 'quantum_crown');
	UPDATE gifts SET gift_type = 'synthwave_cassette' WHERE gift_type IN ('cozy_cup', 'moon_rocket');
	UPDATE gifts SET gift_type = 'tactical_drone' WHERE gift_type IN ('cyber_drone');
	UPDATE gifts SET gift_type = 'combat_stim' WHERE gift_type IN ('neuro_stimulator', 'infinite_coffee');

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

	log.Println("Initial sample data seeded successfully.")
	return nil
}
