package database

import (
	"database/sql"
	"fmt"
	"log"

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
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

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

	ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT '';

	CREATE TABLE IF NOT EXISTS sessions (
		token VARCHAR(64) PRIMARY KEY,
		user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		expires_at TIMESTAMP WITH TIME ZONE NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

	UPDATE users SET password_hash = '$2b$10$VjKN/Wou1MxkZTTqqCfI9u1fx13uG6DbuQkSY1L6Emy2ZwpazYsE6' WHERE password_hash = '' OR password_hash IS NULL;
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

	if count > 0 {
		return nil // Already seeded
	}

	seedSQL := `
	INSERT INTO users (username, display_name, password_hash, avatar_url, bio) VALUES
	('oleg', 'Олег Смирнов', '$2a$10$QO0YI/9wR.PfvP6u7.7H2.dZ/3X1n705bC11E2hQW615RzGk2iK6u', 'https://api.dicebear.com/7.x/bottts/svg?seed=Oleg', 'Разработчик Go & Архитектор систем. Строю соцсеть с нуля! 🚀'),
	('alex', 'Алексей Ковалев', '$2a$10$QO0YI/9wR.PfvP6u7.7H2.dZ/3X1n705bC11E2hQW615RzGk2iK6u', 'https://api.dicebear.com/7.x/bottts/svg?seed=Alex', 'DevOps & Cloud инженер. Люблю микросервисы и чистый код.'),
	('sophia', 'София Романова', '$2a$10$QO0YI/9wR.PfvP6u7.7H2.dZ/3X1n705bC11E2hQW615RzGk2iK6u', 'https://api.dicebear.com/7.x/bottts/svg?seed=Sophia', 'UI/UX дизайнер и фронтенд-энтузиаст. Делаю интерфейсы удобными.')
	ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;


	INSERT INTO posts (user_id, content, created_at) VALUES
	(1, 'Привет всем! Это первый пост в нашей новой социальной сети на Go + PostgreSQL! ⚡🚀', NOW() - INTERVAL '3 hours'),
	(2, 'PostgreSQL 18 в связке с Go работает молниеносно. Задержка запросов менее 2 миллисекунд!', NOW() - INTERVAL '2 hours'),
	(3, 'Интерфейс выглядит лаконично и адаптивно. Давайте проверим добавление постов и лайков!', NOW() - INTERVAL '1 hour');

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
