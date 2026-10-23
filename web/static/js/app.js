// GoSocial Client-side Application Logic v2.0 (with Auth, Toast & Modals)

document.addEventListener('DOMContentLoaded', () => {
    initComposer();
    formatAllPostContents();
    initSSE();
    initCyberFx();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'login') openAuthModal('login');
    if (urlParams.get('auth') === 'register') openAuthModal('register');

    // Routing by view/user
    const viewParam = urlParams.get('view');
    const userParam = urlParams.get('user');
    const sendGiftParam = urlParams.get('send_gift');
    const giftDetailParam = urlParams.get('gift_detail');

    if (viewParam === 'showcase') {
        navigateTo('showcase');
    } else if (userParam || viewParam === 'profile') {
        const uid = parseInt(userParam || window.CURRENT_USER_ID, 10);
        navigateTo('profile', uid);
    }

    if (sendGiftParam) {
        openSendGiftModal(parseInt(sendGiftParam, 10), 'Алексей Ковалев');
    } else if (giftDetailParam) {
        openGiftDetail(parseInt(giftDetailParam, 10));
    }

    // Close modal & theme dropdown on Escape or outside click
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAuthModal();
            closeThemeDropdown();
            closeSendGiftModal();
            closeGiftDetailModal();
            closeEditProfileModal();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.theme-dropdown-container')) {
            closeThemeDropdown();
        }
    });
});

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : '❌';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================
// AUTHENTICATION MODALS & ACTIONS
// ==========================================
function openAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.style.display = 'flex';
    switchAuthTab(tab);
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');

    if (tab === 'login') {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        tabLoginBtn.classList.add('active');
        tabRegisterBtn.classList.remove('active');
        document.getElementById('loginUsername').focus();
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        tabLoginBtn.classList.remove('active');
        tabRegisterBtn.classList.add('active');
        document.getElementById('regUsername').focus();
    }
}

async function fillAndLogin(username, password) {
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = password;
    await submitLogin(username, password);
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    await submitLogin(username, password);
}

async function submitLogin(username, password) {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Ошибка авторизации');
        }

        showToast(`Добро пожаловать, ${data.user.display_name}! 🚀`, 'success');
        closeAuthModal();
        setTimeout(() => {
            window.location.reload();
        }, 300);
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go! Убедитесь, что сервер запущен.' : err.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const displayName = document.getElementById('regDisplayName').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const bio = document.getElementById('regBio').value.trim();
    const avatarUrl = document.getElementById('regAvatar').value.trim();

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                display_name: displayName,
                password: password,
                bio: bio,
                avatar_url: avatarUrl
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Ошибка регистрации');
        }

        showToast(`Аккаунт @${data.user.username} успешно создан! 🎉`, 'success');
        closeAuthModal();
        setTimeout(() => {
            window.location.reload();
        }, 400);
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go! Убедитесь, что сервер запущен.' : err.message, 'error');
    }
}


async function handleLogout() {
    try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        if (res.ok) {
            showToast('Вы вышли из системы 👋', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 500);
        }
    } catch (err) {
        window.location.href = '/';
    }
}

// ==========================================
// NAVIGATION & TABS
// ==========================================
function switchFeedTab(tab) {
    const params = new URLSearchParams(window.location.search);
    params.set('feed_type', tab);
    params.delete('q');
    params.delete('tag');
    window.location.search = params.toString();
}

function executeSearch() {
    const input = document.getElementById('searchInput');
    const val = input.value.trim();
    const params = new URLSearchParams(window.location.search);
    if (val) {
        if (val.startsWith('#')) {
            params.set('tag', val);
            params.delete('q');
        } else {
            params.set('q', val);
            params.delete('tag');
        }
    } else {
        params.delete('q');
        params.delete('tag');
    }
    window.location.search = params.toString();
}

function clearSearch() {
    const params = new URLSearchParams(window.location.search);
    params.delete('q');
    params.delete('tag');
    window.location.search = params.toString();
}

function filterByTag(tag) {
    const params = new URLSearchParams(window.location.search);
    params.set('tag', tag);
    params.delete('q');
    window.location.search = params.toString();
}

function insertTag(tag) {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    textarea.value = (textarea.value.trim() + ' ' + tag).trim() + ' ';
    textarea.focus();
    triggerCharCount();
}

// ==========================================
// COMPOSER & IMAGE ATTACHMENTS
// ==========================================
function initComposer() {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    textarea.addEventListener('input', triggerCharCount);
}

function triggerCharCount() {
    const textarea = document.getElementById('postContent');
    const charCount = document.getElementById('charCount');
    if (!textarea || !charCount) return;
    const len = textarea.value.length;
    charCount.textContent = `${len} / 500`;
    charCount.style.color = (len > 500) ? '#ef4444' : 'var(--text-muted)';
}

function toggleImageBox() {
    const box = document.getElementById('postImageBox');
    if (!box) return;
    box.style.display = (box.style.display === 'none') ? 'flex' : 'none';
    if (box.style.display === 'flex') {
        document.getElementById('postImageUrl').focus();
    }
}

function setImagePreset(url) {
    const input = document.getElementById('postImageUrl');
    if (!input) return;
    input.value = url;
    updateImagePreview();
}

function updateImagePreview() {
    const input = document.getElementById('postImageUrl');
    const container = document.getElementById('imagePreviewContainer');
    const preview = document.getElementById('imagePreview');
    const url = input.value.trim();

    if (url) {
        preview.src = url;
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function clearImageInput() {
    const input = document.getElementById('postImageUrl');
    const container = document.getElementById('imagePreviewContainer');
    if (input) input.value = '';
    if (container) container.style.display = 'none';
}

async function createPost() {
    if (!window.IS_AUTHENTICATED) {
        showToast('Пожалуйста, войдите в аккаунт, чтобы опубликовать запись 🔐', 'error');
        openAuthModal('login');
        return;
    }

    const textarea = document.getElementById('postContent');
    const content = textarea.value.trim();
    const imageInput = document.getElementById('postImageUrl');
    const imageUrl = imageInput ? imageInput.value.trim() : '';

    if (!content && !imageUrl) {
        showToast('Введите текст публикации или прикрепите фото', 'error');
        return;
    }

    if (content.length > 500) {
        showToast('Длина текста превышает 500 символов', 'error');
        return;
    }

    try {
        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content,
                image_url: imageUrl
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка при публикации');
        }

        const post = await response.json();
        textarea.value = '';
        triggerCharCount();
        clearImageInput();
        const imageBox = document.getElementById('postImageBox');
        if (imageBox) imageBox.style.display = 'none';

        renderPostAtTop(post);

        soundEngine.playPost();
        const submitBtn = document.querySelector('.composer-submit-group .btn-primary');
        if (submitBtn) {
            const rect = submitBtn.getBoundingClientRect();
            spawnConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }

        const statPosts = document.getElementById('statPosts');
        if (statPosts) {
            statPosts.textContent = parseInt(statPosts.textContent || '0') + 1;
        }

        const emptyNotice = document.querySelector('.empty-feed-card');
        if (emptyNotice) emptyNotice.remove();

        showToast('Публикация успешно размещена! 🚀', 'success');
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go! Проверьте бэкенд.' : err.message, 'error');
    }
}

// ==========================================
// EDIT & DELETE POSTS
// ==========================================
function openEditPost(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт для редактирования ✏️', 'error');
        openAuthModal('login');
        return;
    }
    const contentEl = document.getElementById(`post-content-${postId}`);

    const editBox = document.getElementById(`post-edit-box-${postId}`);
    if (contentEl && editBox) {
        contentEl.style.display = 'none';
        editBox.style.display = 'flex';
        const textarea = document.getElementById(`edit-textarea-${postId}`);
        if (textarea) textarea.focus();
    }
}

function cancelEditPost(postId) {
    const contentEl = document.getElementById(`post-content-${postId}`);
    const editBox = document.getElementById(`post-edit-box-${postId}`);
    if (contentEl && editBox) {
        contentEl.style.display = 'block';
        editBox.style.display = 'none';
    }
}

async function saveEditPost(postId) {
    const textarea = document.getElementById(`edit-textarea-${postId}`);
    const newContent = textarea.value.trim();

    if (!newContent) {
        showToast('Текст не может быть пустым', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: newContent
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка сохранения');
        }

        const post = await response.json();
        const contentEl = document.getElementById(`post-content-${postId}`);
        contentEl.innerHTML = formatHashtags(post.content);
        contentEl.style.display = 'block';

        const editBox = document.getElementById(`post-edit-box-${postId}`);
        if (editBox) editBox.style.display = 'none';

        const metaLine = document.querySelector(`#post-${postId} .meta-line`);
        if (metaLine && !metaLine.querySelector('.edited-badge')) {
            const badge = document.createElement('span');
            badge.className = 'edited-badge';
            badge.textContent = '• (изменено)';
            metaLine.appendChild(badge);
        }

        showToast('Публикация обновлена ✏️', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deletePost(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт для удаления публикации 🗑️', 'error');
        openAuthModal('login');
        return;
    }
    if (!confirm('Вы уверены, что хотите удалить этот пост?')) return;

    try {
        const response = await fetch(`/api/posts/${postId}?user_id=${window.CURRENT_USER_ID}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка удаления');
        }

        const postCard = document.getElementById(`post-${postId}`);
        if (postCard) postCard.remove();

        const statPosts = document.getElementById('statPosts');
        if (statPosts) {
            let current = parseInt(statPosts.textContent || '0');
            statPosts.textContent = Math.max(0, current - 1);
        }

        showToast('Публикация удалена 🗑️', 'success');
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go!' : err.message, 'error');
    }
}

// ==========================================
// LIKES & COMMENTS
// ==========================================
async function toggleLike(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы ставить лайки ❤️', 'error');
        openAuthModal('login');
        return;
    }

    try {
        const response = await fetch(`/api/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID
            })
        });

        if (!response.ok) throw new Error('Ошибка при лайке');

        const data = await response.json();
        const postCard = document.getElementById(`post-${postId}`);
        const likeBtn = postCard.querySelector('.like-btn');
        const likeCount = document.getElementById(`likes-${postId}`);
        const heartIcon = likeBtn.querySelector('.heart-icon');

        likeCount.textContent = data.likes_count;

        if (data.is_liked) {
            likeBtn.classList.add('active');
            heartIcon.setAttribute('fill', 'currentColor');
            soundEngine.playHeart();
            const rect = likeBtn.getBoundingClientRect();
            spawnHearts(rect.left + rect.width / 2, rect.top + rect.height / 2);
        } else {
            likeBtn.classList.remove('active');
            heartIcon.setAttribute('fill', 'none');
            soundEngine.playClick();
        }
    } catch (err) {
        console.error('Like error:', err);
    }
}

function toggleComments(postId) {
    const section = document.getElementById(`comments-section-${postId}`);
    if (!section) return;
    section.style.display = (section.style.display === 'none') ? 'block' : 'none';
}

async function addComment(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы оставить комментарий 💬', 'error');
        openAuthModal('login');
        return;
    }

    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();

    if (!content) return;

    try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content
            })
        });

        if (!response.ok) throw new Error('Ошибка комментирования');

        const comment = await response.json();
        input.value = '';

        const commentsList = document.getElementById(`comments-list-${postId}`);
        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        commentEl.innerHTML = `
            <img src="${escapeHtml(comment.user.avatar_url)}" alt="avatar" class="comment-avatar">
            <div class="comment-bubble">
                <div class="comment-author-line">
                    <span class="comment-author">${escapeHtml(comment.user.display_name)}</span>
                    <span class="comment-time">${formatTime(comment.created_at)}</span>
                </div>
                <div class="comment-text">${escapeHtml(comment.content)}</div>
            </div>
        `;
        commentsList.appendChild(commentEl);

        const countEl = document.getElementById(`comment-count-${postId}`);
        if (countEl) {
            countEl.textContent = parseInt(countEl.textContent || '0') + 1;
        }

        showToast('Комментарий добавлен 💬', 'success');
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go!' : err.message, 'error');
    }
}

async function toggleFollow(targetUserId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы подписываться на авторов 👥', 'error');
        openAuthModal('login');
        return;
    }

    try {
        const response = await fetch('/api/users/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                follower_id: window.CURRENT_USER_ID,
                following_id: targetUserId
            })
        });

        if (!response.ok) throw new Error('Ошибка подписки');

        const data = await response.json();
        const userRow = document.getElementById(`user-row-${targetUserId}`);
        const followBtn = userRow.querySelector('button');

        if (data.is_following) {
            followBtn.textContent = 'Читаю';
            followBtn.classList.add('btn-following');
            showToast('Вы подписались на автора! 👥', 'success');
        } else {
            followBtn.textContent = 'Читать';
            followBtn.classList.remove('btn-following');
            showToast('Вы отписались от автора', 'success');
        }

        const statFollowing = document.getElementById('statFollowing');
        if (statFollowing) {
            let current = parseInt(statFollowing.textContent || '0');
            statFollowing.textContent = data.is_following ? current + 1 : Math.max(0, current - 1);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// RENDER HELPERS
// ==========================================
function renderPostAtTop(post) {
    const container = document.getElementById('postsContainer');
    const postEl = createPostElement(post);
    container.insertBefore(postEl, container.firstChild);
    attachCardTilt(postEl);
}

function createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'card post-card';
    article.id = `post-${post.id}`;

    const formattedDate = formatFullDate(post.created_at);
    const isLiked = post.is_liked;

    let mediaHtml = '';
    if (post.image_url) {
        mediaHtml = `
            <div class="post-media" id="post-media-${post.id}">
                <img src="${escapeHtml(post.image_url)}" alt="Фото к посту" loading="lazy">
            </div>
        `;
    }

    let editedHtml = post.is_edited ? `<span class="edited-badge">• (изменено)</span>` : '';

    article.innerHTML = `
        <div class="post-header">
            <img src="${escapeHtml(post.user.avatar_url)}" alt="${escapeHtml(post.user.display_name)}" class="mini-avatar">
            <div class="post-user-info">
                <div class="author-line">
                    <span class="post-author">${escapeHtml(post.user.display_name)}</span>
                    <span class="post-handle">@${escapeHtml(post.user.username)}</span>
                </div>
                <div class="meta-line">
                    <time class="post-time">${formattedDate}</time>
                    ${editedHtml}
                </div>
            </div>
            <div class="post-header-actions">
                <button class="btn-icon-action btn-edit" title="Редактировать пост" onclick="openEditPost(${post.id})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button class="btn-icon-action btn-delete" title="Удалить пост" onclick="deletePost(${post.id})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
        <div class="post-content" id="post-content-${post.id}">
            ${formatHashtags(post.content)}
        </div>
        <div class="post-edit-box" id="post-edit-box-${post.id}" style="display: none;">
            <textarea id="edit-textarea-${post.id}" rows="3">${escapeHtml(post.content)}</textarea>
            <div class="edit-actions">
                <button class="btn btn-primary btn-xs" onclick="saveEditPost(${post.id})">Сохранить</button>
                <button class="btn btn-secondary btn-xs" onclick="cancelEditPost(${post.id})">Отмена</button>
            </div>
        </div>
        ${mediaHtml}
        <div class="post-footer">
            <button class="btn-action like-btn ${isLiked ? 'active' : ''}" onclick="toggleLike(${post.id})">
                <svg class="heart-icon" width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                </svg>
                <span class="like-count" id="likes-${post.id}">${post.likes_count}</span>
            </button>

            <button class="btn-action comment-toggle-btn" onclick="toggleComments(${post.id})">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span id="comment-count-${post.id}">0</span>
            </button>
        </div>
        <div class="comments-section" id="comments-section-${post.id}" style="display: block;">
            <div class="comments-list" id="comments-list-${post.id}"></div>
            <div class="comment-input-row">
                <input type="text" id="comment-input-${post.id}" placeholder="Напишите комментарий..." onkeydown="if(event.key==='Enter') addComment(${post.id})">
                <button class="btn btn-secondary btn-sm" onclick="addComment(${post.id})">Отправить</button>
            </div>
        </div>
    `;

    return article;
}

function formatAllPostContents() {
    document.querySelectorAll('.post-content').forEach(el => {
        el.innerHTML = formatHashtags(el.textContent.trim());
    });
}

function formatHashtags(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped.replace(/#([\w\u0400-\u04FF]+)/gi, (match) => {
        return `<span class="hashtag-link" onclick="filterByTag('${match}')">${match}</span>`;
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(isoString) {
    const d = new Date(isoString);
    return `${formatTime(isoString)} ${d.toLocaleDateString()}`;
}

// ==========================================
// REAL-TIME SERVER-SENT EVENTS (SSE)
// ==========================================
function initSSE() {
    if (!window.EventSource) return;

    const liveDot = document.getElementById('sseDot');
    const liveText = document.getElementById('sseText');

    const eventSource = new EventSource('/api/events');

    eventSource.onopen = () => {
        console.log('⚡ [SSE] Connected to real-time events');
        if (liveDot) liveDot.style.backgroundColor = '#10b981';
        if (liveText) liveText.textContent = 'Live SSE';
    };

    eventSource.onmessage = (e) => {
        try {
            const event = JSON.parse(e.data);
            handleRealtimeEvent(event);
        } catch (err) {
            console.error('[SSE] parse error:', err);
        }
    };

    eventSource.onerror = () => {
        if (liveDot) liveDot.style.backgroundColor = '#f59e0b';
        if (liveText) liveText.textContent = 'Подключение...';
    };
}

function handleRealtimeEvent(event) {
    if (!event || !event.type) return;

    if (event.type === 'new_post') {
        const post = event.payload;
        if (!post || !post.id) return;

        // Если пост еще не отображен (пришел от другого пользователя в реальном времени)
        const existing = document.getElementById(`post-${post.id}`);
        if (!existing) {
            renderPostAtTop(post);
            soundEngine.playSse();
            triggerShockwave();

            const emptyNotice = document.querySelector('.empty-feed-card');
            if (emptyNotice) emptyNotice.remove();

            // Анимация подсветки нового живого поста
            const card = document.getElementById(`post-${post.id}`);
            if (card) {
                card.classList.add('post-card-live-in');
                setTimeout(() => card.classList.remove('post-card-live-in'), 3000);
            }

            if (post.user && post.user.id !== window.CURRENT_USER_ID) {
                showToast(`⚡ Новый пост от ${post.user.display_name}! 🚀`, 'success');
            }
        }
    } else if (event.type === 'like_update') {
        const data = event.payload;
        if (!data || !data.post_id) return;

        const countEl = document.getElementById(`likes-${data.post_id}`);
        if (countEl) {
            countEl.textContent = data.likes_count;
        }

        const postCard = document.getElementById(`post-${data.post_id}`);
        if (postCard) {
            const heartIcon = postCard.querySelector('.heart-icon');
            if (heartIcon) {
                soundEngine.playHeart();
                heartIcon.classList.add('heart-beat-anim');
                setTimeout(() => heartIcon.classList.remove('heart-beat-anim'), 400);
            }
        }
    } else if (event.type === 'new_comment') {
        const data = event.payload;
        if (!data || !data.post_id || !data.comment) return;

        soundEngine.playClick();
        const countEl = document.getElementById(`comment-count-${data.post_id}`);
        if (countEl) {
            countEl.textContent = parseInt(countEl.textContent || '0') + 1;
        }

        const commentsList = document.getElementById(`comments-list-${data.post_id}`);
        if (commentsList) {
            const comment = data.comment;
            const commentEl = document.createElement('div');
            commentEl.className = 'comment-item comment-item-live-in';
            commentEl.innerHTML = `
                <img src="${escapeHtml(comment.user.avatar_url)}" alt="avatar" class="comment-avatar">
                <div class="comment-bubble">
                    <div class="comment-author-line">
                        <span class="comment-author">${escapeHtml(comment.user.display_name)}</span>
                        <span class="comment-time">${formatTime(comment.created_at)}</span>
                    </div>
                    <div class="comment-text">${escapeHtml(comment.content)}</div>
                </div>
            `;
            commentsList.appendChild(commentEl);
            setTimeout(() => commentEl.classList.remove('comment-item-live-in'), 2000);
        }

        if (data.comment.user && data.comment.user.id !== window.CURRENT_USER_ID) {
            showToast(`💬 @${data.comment.user.username} оставил комментарий`, 'success');
        }
    } else if (event.type === 'new_gift') {
        const data = event.payload;
        if (!data || !data.gift) return;

        const gift = data.gift;
        if (data.receiver_id === window.CURRENT_USER_ID) {
            soundEngine.playGiftFanfare();
            triggerShockwave();
            const senderName = (gift.is_anonymous || !gift.sender) ? 'Анонимный поклонник 🎭' : `@${gift.sender.username}`;
            showToast(`🎁 Вы получили подарок «${getGiftTitle(gift.gift_type)}» от ${senderName}! ✨`, 'success');

            // Обновить счетчик на карточке профиля
            const statGifts = document.getElementById('heroStatGifts');
            if (statGifts) {
                const current = parseInt(statGifts.textContent.replace(/\D/g, '') || '0') + 1;
                statGifts.textContent = `🎁 ${current}`;
            }
            const badgeGifts = document.getElementById('badgeProfGifts');
            if (badgeGifts) {
                badgeGifts.textContent = parseInt(badgeGifts.textContent || '0') + 1;
            }

            // Если открыт таб подарков своего профиля, вставить подарок
            const profGiftsGrid = document.getElementById('profGiftsGrid');
            if (profGiftsGrid && currentProfileUserId === window.CURRENT_USER_ID) {
                renderGiftCard(gift, profGiftsGrid, true);
            }
        }

        // Если открыта общая витрина
        const globalGrid = document.getElementById('globalShowcaseGrid');
        if (globalGrid) {
            renderGiftCard(gift, globalGrid, true);
        }
    }
}

// ==========================================
// FUTURISTIC SOUND SYNTHESIZER ENGINE (Web Audio API)
// ==========================================
class FuturisticSoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = localStorage.getItem('gosocial_sfx') !== 'false';
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('gosocial_sfx', this.enabled ? 'true' : 'false');
        this.updatePill();
        if (this.enabled) this.playClick();
        return this.enabled;
    }

    updatePill() {
        const soundIcon = document.getElementById('soundIcon');
        const soundBtn = document.getElementById('soundToggle');
        if (soundIcon) soundIcon.textContent = this.enabled ? '🔊' : '🔈';
        if (soundBtn) {
            if (this.enabled) {
                soundBtn.style.borderColor = 'var(--accent-blue)';
                soundBtn.style.color = 'var(--text-primary)';
            } else {
                soundBtn.style.borderColor = 'var(--border-subtle)';
                soundBtn.style.color = 'var(--text-muted)';
            }
        }
    }

    playClick() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const now = this.ctx.currentTime;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.04);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.05);
        } catch(e) {}
    }

    playHeart() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            [523.25, 659.25].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.03);
                gain.gain.setValueAtTime(0.12, now + idx * 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.25);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.03);
                osc.stop(now + idx * 0.03 + 0.28);
            });
        } catch(e) {}
    }

    playPost() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.26);
        } catch(e) {}
    }

    playSse() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            [1046.5, 1318.5].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.06);
                gain.gain.setValueAtTime(0.1, now + idx * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.4);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.06);
                osc.stop(now + idx * 0.06 + 0.42);
            });
        } catch(e) {}
    }

    playGiftFanfare() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                gain.gain.setValueAtTime(0.15, now + idx * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.6);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.08);
                osc.stop(now + idx * 0.08 + 0.62);
            });
        } catch(e) {}
    }
}
const soundEngine = new FuturisticSoundEngine();

function toggleSoundFx() {
    soundEngine.toggle();
}

// ==========================================
// THEME SWITCHER
// ==========================================
const THEMES = {
    aurora: { name: 'Aurora', icon: '🌌' },
    cyberpunk: { name: 'Cyberpunk', icon: '⚡' },
    emerald: { name: 'Emerald', icon: '💎' }
};

function initThemes() {
    const urlParams = new URLSearchParams(window.location.search);
    const themeFromUrl = urlParams.get('theme');
    const savedTheme = themeFromUrl || localStorage.getItem('gosocial_theme') || 'aurora';
    applyTheme(savedTheme, false);
}

function toggleThemeDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('themeMenu');
    if (menu) menu.classList.toggle('active');
    soundEngine.playClick();
}

function closeThemeDropdown() {
    const menu = document.getElementById('themeMenu');
    if (menu) menu.classList.remove('active');
}

function applyTheme(themeKey, playSound = true) {
    if (!THEMES[themeKey]) themeKey = 'aurora';
    document.body.setAttribute('data-theme', themeKey);
    localStorage.setItem('gosocial_theme', themeKey);

    const iconEl = document.getElementById('themeCurrentIcon');
    const labelEl = document.getElementById('themeCurrentLabel');
    if (iconEl) iconEl.textContent = THEMES[themeKey].icon;
    if (labelEl) labelEl.textContent = THEMES[themeKey].name;

    // Update active class in dropdown items
    document.querySelectorAll('.theme-menu-item').forEach(item => {
        if (item.getAttribute('data-theme') === themeKey) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    closeThemeDropdown();
    if (playSound) soundEngine.playClick();
}

// ==========================================
// INTERACTIVE AMBIENT COSMIC CANVAS
// ==========================================
function initAmbientCanvas() {
    const canvas = document.getElementById('ambientCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    const count = 48;
    let mouse = { x: -1000, y: -1000 };

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.45,
            vy: (Math.random() - 0.5) * 0.45,
            radius: Math.random() * 1.8 + 0.8,
            baseAlpha: Math.random() * 0.45 + 0.25
        });
    }

    function render() {
        if (document.hidden) {
            requestAnimationFrame(render);
            return;
        }

        ctx.clearRect(0, 0, width, height);

        const isCyber = document.body.getAttribute('data-theme') === 'cyberpunk';
        const isEmerald = document.body.getAttribute('data-theme') === 'emerald';
        const particleColor = isCyber ? '252, 238, 10' : (isEmerald ? '16, 185, 129' : '56, 189, 248');

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;

            // Mouse gravitational pull
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 140) {
                const force = (140 - dist) / 140;
                p.x += (dx / dist) * force * 0.6;
                p.y += (dy / dist) * force * 0.6;

                // Glowing line to cursor
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(mouse.x, mouse.y);
                ctx.strokeStyle = `rgba(${particleColor}, ${force * 0.35})`;
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }

            // Draw particle
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${particleColor}, ${p.baseAlpha})`;
            ctx.shadowBlur = 8;
            ctx.shadowColor = `rgba(${particleColor}, 0.6)`;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Connect nearby particles
            for (let j = i + 1; j < particles.length; j++) {
                const p2 = particles[j];
                const dxx = p.x - p2.x;
                const dyy = p.y - p2.y;
                const d = Math.sqrt(dxx * dxx + dyy * dyy);
                if (d < 85) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = `rgba(${particleColor}, ${(85 - d) / 85 * 0.16})`;
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(render);
    }
    render();
}

// ==========================================
// MOUSE AMBIENT AURA FOLLOWER
// ==========================================
function initMouseAura() {
    const aura = document.getElementById('mouseAura');
    if (!aura) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;

    window.addEventListener('mousemove', (e) => {
        targetX = e.clientX;
        targetY = e.clientY;
    });

    function loop() {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;
        aura.style.left = `${currentX}px`;
        aura.style.top = `${currentY}px`;
        requestAnimationFrame(loop);
    }
    loop();
}

// ==========================================
// 3D CARD TILT & HOLOGRAPHIC FOIL SHEEN
// ==========================================
function init3DCardTilt() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => attachCardTilt(card));
}

function attachCardTilt(card) {
    if (card._hasTiltAttached) return;
    card._hasTiltAttached = true;

    // Inject shine element if not present
    if (!card.querySelector('.card-shine')) {
        const shine = document.createElement('div');
        shine.className = 'card-shine';
        card.appendChild(shine);
    }

    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        const xNorm = x / width;
        const yNorm = y / height;

        const rotateX = ((yNorm - 0.5) * -9).toFixed(2);
        const rotateY = ((xNorm - 0.5) * 9).toFixed(2);

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.012, 1.012, 1.012)`;
        card.style.setProperty('--shine-x', `${(xNorm * 100).toFixed(1)}%`);
        card.style.setProperty('--shine-y', `${(yNorm * 100).toFixed(1)}%`);
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
}

// ==========================================
// CANVAS PARTICLE EXPLOSIONS (Hearts & Cyber Confetti)
// ==========================================
let fxCanvas, fxCtx;
let fxParticles = [];
let isFxLoopRunning = false;

function initParticleCanvas() {
    fxCanvas = document.getElementById('fxCanvas');
    if (!fxCanvas) return;
    fxCtx = fxCanvas.getContext('2d');
    function resize() {
        fxCanvas.width = window.innerWidth;
        fxCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();
}

function spawnHearts(originX, originY) {
    if (!fxCtx) return;
    const icons = ['❤️', '💖', '✨', '⚡'];
    for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2.5;
        fxParticles.push({
            type: 'text',
            text: icons[Math.floor(Math.random() * icons.length)],
            x: originX,
            y: originY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.5,
            size: Math.random() * 8 + 14,
            alpha: 1,
            gravity: 0.18,
            decay: Math.random() * 0.015 + 0.018,
            rotation: (Math.random() - 0.5) * 0.4,
            rotSpeed: (Math.random() - 0.5) * 0.08
        });
    }
    startFxLoop();
}

function spawnConfetti(originX, originY) {
    if (!fxCtx) return;
    const colors = ['#38bdf8', '#fcee0a', '#ff0055', '#10b981', '#c084fc', '#ffffff'];
    for (let i = 0; i < 40; i++) {
        const angle = (Math.random() * -Math.PI) * 0.8 - 0.1 * Math.PI; // Launch upwards
        const speed = Math.random() * 8 + 4;
        fxParticles.push({
            type: 'rect',
            color: colors[Math.floor(Math.random() * colors.length)],
            x: originX,
            y: originY,
            vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 3,
            vy: Math.sin(angle) * speed,
            w: Math.random() * 6 + 4,
            h: Math.random() * 4 + 3,
            alpha: 1,
            gravity: 0.22,
            friction: 0.98,
            decay: Math.random() * 0.014 + 0.012,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.18
        });
    }
    startFxLoop();
}

function startFxLoop() {
    if (isFxLoopRunning) return;
    isFxLoopRunning = true;
    requestAnimationFrame(fxLoop);
}

function fxLoop() {
    if (!fxCtx || fxParticles.length === 0) {
        if (fxCtx) fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        isFxLoopRunning = false;
        return;
    }

    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

    for (let i = fxParticles.length - 1; i >= 0; i--) {
        const p = fxParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        if (p.friction) p.vx *= p.friction;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
            fxParticles.splice(i, 1);
            continue;
        }

        fxCtx.save();
        fxCtx.globalAlpha = Math.max(0, p.alpha);
        fxCtx.translate(p.x, p.y);

        if (p.type === 'text') {
            p.rotation += p.rotSpeed;
            fxCtx.rotate(p.rotation);
            fxCtx.font = `${p.size}px sans-serif`;
            fxCtx.textAlign = 'center';
            fxCtx.textBaseline = 'middle';
            fxCtx.fillText(p.text, 0, 0);
        } else if (p.type === 'rect') {
            p.rot += p.rotSpeed;
            fxCtx.rotate(p.rot);
            fxCtx.fillStyle = p.color;
            fxCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }

        fxCtx.restore();
    }

    requestAnimationFrame(fxLoop);
}

// ==========================================
// REAL-TIME SHOCKWAVE TRIGGER
// ==========================================
function triggerShockwave() {
    const shockwave = document.getElementById('sseShockwave');
    if (!shockwave) return;
    shockwave.classList.remove('active');
    void shockwave.offsetWidth; // trigger reflow
    shockwave.classList.add('active');
    setTimeout(() => shockwave.classList.remove('active'), 900);
}

// ==========================================
// ANIMATED NUMBER COUNTERS
// ==========================================
function animateNumberCounters() {
    ['statPosts', 'statFollowers', 'statFollowing'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const target = parseInt(el.textContent.trim(), 10) || 0;
        if (target <= 0) return;
        let current = 0;
        const duration = 1000;
        const stepTime = Math.max(20, Math.floor(duration / target));
        const increment = Math.ceil(target / (duration / stepTime));

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                el.textContent = target;
                clearInterval(timer);
            } else {
                el.textContent = current;
            }
        }, stepTime);
    });
}

function initCyberFx() {
    soundEngine.updatePill();
    initThemes();
    initAmbientCanvas();
    initMouseAura();
    init3DCardTilt();
    initParticleCanvas();
    animateNumberCounters();
}

// ==========================================
// NAVIGATION & VIEWS (Feed / Profile / Showcase)
// ==========================================
let currentView = 'feed';
let currentProfileUserId = null;
let currentProfileUserData = null;

function navigateTo(view, userId = null) {
    currentView = view;
    soundEngine.playClick();

    const feedView = document.getElementById('feedView');
    const profileView = document.getElementById('profileView');
    const showcaseView = document.getElementById('showcaseView');

    const tabNavFeed = document.getElementById('tabNavFeed');
    const tabNavProfile = document.getElementById('tabNavProfile');
    const tabNavGifts = document.getElementById('tabNavGifts');

    [tabNavFeed, tabNavProfile, tabNavGifts].forEach(btn => btn && btn.classList.remove('active'));

    if (view === 'feed') {
        if (feedView) feedView.style.display = 'block';
        if (profileView) profileView.style.display = 'none';
        if (showcaseView) showcaseView.style.display = 'none';
        if (tabNavFeed) tabNavFeed.classList.add('active');
        window.history.pushState({}, '', '/');
    } else if (view === 'my-profile' || (view === 'profile' && userId === window.CURRENT_USER_ID)) {
        if (!window.IS_AUTHENTICATED) {
            showToast('Войдите в аккаунт для просмотра личного профиля 🔐', 'error');
            openAuthModal('login');
            return;
        }
        if (feedView) feedView.style.display = 'none';
        if (profileView) profileView.style.display = 'block';
        if (showcaseView) showcaseView.style.display = 'none';
        if (tabNavProfile) tabNavProfile.classList.add('active');
        loadUserProfile(window.CURRENT_USER_ID);
        window.history.pushState({}, '', `/?view=profile&user=${window.CURRENT_USER_ID}`);
    } else if (view === 'profile' && userId) {
        if (feedView) feedView.style.display = 'none';
        if (profileView) profileView.style.display = 'block';
        if (showcaseView) showcaseView.style.display = 'none';
        loadUserProfile(userId);
        window.history.pushState({}, '', `/?view=profile&user=${userId}`);
    } else if (view === 'showcase') {
        if (feedView) feedView.style.display = 'none';
        if (profileView) profileView.style.display = 'none';
        if (showcaseView) showcaseView.style.display = 'block';
        if (tabNavGifts) tabNavGifts.classList.add('active');
        loadShowcaseGifts();
        window.history.pushState({}, '', '/?view=showcase');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openUserProfile(userId) {
    navigateTo('profile', userId);
}

// ==========================================
// PROFILE DATA LOADING & RENDERING
// ==========================================
async function loadUserProfile(userId) {
    currentProfileUserId = userId;
    const heroDisplayName = document.getElementById('heroDisplayName');
    if (heroDisplayName) heroDisplayName.textContent = 'Загрузка данных...';

    try {
        const res = await fetch(`/api/users/${userId}/profile`);
        if (!res.ok) throw new Error('Ошибка загрузки профиля');
        const data = await res.json();
        renderUserProfile(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderUserProfile(data) {
    const u = data.user;
    currentProfileUserData = u;

    // Breadcrumbs
    const bc = document.getElementById('profileBreadcrumbUser');
    if (bc) bc.textContent = `@${u.username}`;

    // Avatar & Status
    const avatar = document.getElementById('heroAvatar');
    if (avatar) avatar.src = u.avatar_url;
    const status = document.getElementById('heroOnlineStatus');
    if (status) status.style.display = 'block';

    // Names & Bio
    const nameEl = document.getElementById('heroDisplayName');
    if (nameEl) nameEl.textContent = u.display_name;
    const unameEl = document.getElementById('heroUsername');
    if (unameEl) unameEl.textContent = `@${u.username}`;
    const bioEl = document.getElementById('heroBio');
    if (bioEl) bioEl.textContent = u.bio || 'Пользователь пока не добавил описание профиля.';

    // Role badge
    const roleBadge = document.getElementById('heroRoleBadge');
    if (roleBadge) {
        if (u.id === 1) {
            roleBadge.textContent = '⚡ Создатель платформы';
            roleBadge.style.color = '#f59e0b';
        } else if (u.id === 2) {
            roleBadge.textContent = '🛠️ DevOps Архитектор';
            roleBadge.style.color = '#38bdf8';
        } else if (u.id === 3) {
            roleBadge.textContent = '🎨 UI/UX Визионер';
            roleBadge.style.color = '#ec4899';
        } else {
            roleBadge.textContent = '🚀 Участник сообщества';
            roleBadge.style.color = 'var(--accent-blue)';
        }
    }

    // Stats
    const pCount = data.posts ? data.posts.length : 0;
    const gCount = data.gifts ? data.gifts.length : 0;
    const fCount = data.followers ? data.followers.length : 0;
    const foCount = data.following ? data.following.length : 0;

    document.getElementById('heroStatPosts').textContent = pCount;
    document.getElementById('heroStatGifts').textContent = `🎁 ${gCount}`;
    document.getElementById('heroStatFollowers').textContent = fCount;
    document.getElementById('heroStatFollowing').textContent = foCount;

    document.getElementById('badgeProfPosts').textContent = pCount;
    document.getElementById('badgeProfGifts').textContent = gCount;
    document.getElementById('netFollowersCount').textContent = fCount;
    document.getElementById('netFollowingCount').textContent = foCount;

    // Action buttons
    const actionsGroup = document.getElementById('heroActionsContainer');
    if (actionsGroup) {
        actionsGroup.innerHTML = '';
        if (data.is_owner) {
            // Own profile: Edit Profile button
            actionsGroup.innerHTML = `
                <button class="btn btn-secondary btn-sm" onclick="openEditProfileModal()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    <span>Редактировать профиль</span>
                </button>
            `;
            const comp = document.getElementById('profComposerCard');
            if (comp) comp.style.display = 'block';
        } else {
            // Other user's profile: Follow + Send Gift button!
            const isFollowing = data.is_following;
            actionsGroup.innerHTML = `
                <button class="btn btn-outline btn-sm ${isFollowing ? 'btn-following' : ''}" onclick="toggleFollowInProfile(${u.id})">
                    <span>${isFollowing ? '✓ Читаю' : '+ Читать'}</span>
                </button>
                <button class="btn btn-primary btn-sm btn-gift-hero" onclick="openSendGiftModal(${u.id}, '${escapeHtml(u.display_name)}', '${escapeHtml(u.username)}')">
                    <span>🎁 Подарить артефакт</span>
                </button>
            `;
            const comp = document.getElementById('profComposerCard');
            if (comp) comp.style.display = 'none';
        }
    }

    // Render User Posts
    renderProfilePosts(data.posts);

    // Render User Gifts
    renderProfileGifts(data.gifts);

    // Render Network Lists
    renderProfileNetwork(data.followers, data.following);

    // Default to Posts tab
    switchProfileTab('posts', false);
}

function switchProfileTab(tabName, playSound = true) {
    if (playSound) soundEngine.playClick();

    ['Posts', 'Gifts', 'Network'].forEach(t => {
        const btn = document.getElementById(`profTabBtn${t}`);
        const pane = document.getElementById(`profTabContent${t}`);
        const card = document.getElementById(`statCard${t}`);

        const isCurrent = (t.toLowerCase() === tabName.toLowerCase());
        if (btn) btn.classList.toggle('active', isCurrent);
        if (pane) pane.style.display = isCurrent ? 'block' : 'none';
        if (card) card.classList.toggle('active', isCurrent);
    });
}

function renderProfilePosts(posts) {
    const container = document.getElementById('profPostsList');
    if (!container) return;
    container.innerHTML = '';

    if (!posts || posts.length === 0) {
        container.innerHTML = `
            <div class="card empty-feed-card">
                <span class="empty-icon">📭</span>
                <h3>Пока нет публикаций</h3>
                <p>Этот автор еще не разместил постов.</p>
            </div>
        `;
        return;
    }

    posts.forEach(post => {
        const postEl = createPostElement(post);
        container.appendChild(postEl);
        attachCardTilt(postEl);
    });
}

function renderProfileGifts(gifts) {
    const grid = document.getElementById('profGiftsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!gifts || gifts.length === 0) {
        grid.innerHTML = `
            <div class="card empty-feed-card" style="grid-column: 1 / -1; padding: 2rem;">
                <span class="empty-icon">🎁</span>
                <h3>Коллекция подарков пока пуста</h3>
                <p>Станьте первым, кто подарит этому пользователю цифровой артефакт!</p>
                <button class="btn btn-primary btn-sm" style="margin-top: 0.8rem;" onclick="openCurrentProfileGiftModal()">
                    <span>🎁 Отправить первый подарок</span>
                </button>
            </div>
        `;
        return;
    }

    gifts.forEach(gift => {
        renderGiftCard(gift, grid);
    });
}

function renderProfileNetwork(followers, following) {
    const fList = document.getElementById('profFollowersList');
    const foList = document.getElementById('profFollowingList');

    if (fList) {
        fList.innerHTML = (!followers || followers.length === 0) ? '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">Пока нет подписчиков</p>' : '';
        (followers || []).forEach(u => fList.appendChild(createUserRow(u)));
    }

    if (foList) {
        foList.innerHTML = (!following || following.length === 0) ? '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">Пока нет подписок</p>' : '';
        (following || []).forEach(u => foList.appendChild(createUserRow(u)));
    }
}

function createUserRow(u) {
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `
        <img src="${escapeHtml(u.avatar_url)}" alt="avatar" class="mini-avatar cursor-pointer" onclick="openUserProfile(${u.id})">
        <div class="user-row-info cursor-pointer" onclick="openUserProfile(${u.id})">
            <span class="user-row-name">${escapeHtml(u.display_name)}</span>
            <span class="user-row-handle">@${escapeHtml(u.username)}</span>
        </div>
        <button class="btn btn-outline btn-xs ${u.is_following ? 'btn-following' : ''}" onclick="toggleFollow(${u.id})">
            ${u.is_following ? 'Читаю' : 'Читать'}
        </button>
    `;
    return row;
}

// ==========================================
// DIGITAL GIFTS SPECIFICATION & RENDERING
// ==========================================
const GIFT_SPECS = {
    supernova: { title: 'Квантовая Сверхновая', rarity: 'Mythic', icon: '🪐', class: 'rarity-mythic' },
    quantum_crown: { title: 'Корона Архитектора', rarity: 'Legendary', icon: '👑', class: 'rarity-legendary' },
    cyber_unicorn: { title: 'Кибер-Пегас', rarity: 'Mythic', icon: '🦄', class: 'rarity-mythic' },
    moon_rocket: { title: 'Гиперзвуковая Ракета', rarity: 'Epic', icon: '🚀', class: 'rarity-epic' },
    infinite_coffee: { title: 'Вечный Эликсир Кода', rarity: 'Rare', icon: '☕', class: 'rarity-rare' },
    quantum_diamond: { title: 'Квантовый Кристалл', rarity: 'Legendary', icon: '💎', class: 'rarity-legendary' }
};

function getGiftTitle(type) {
    return (GIFT_SPECS[type] && GIFT_SPECS[type].title) || 'Цифровой подарок';
}

function getGiftRarity(type) {
    return (GIFT_SPECS[type] && GIFT_SPECS[type].rarity) || 'Rare';
}

function getGiftAnimationHtml(type) {
    switch (type) {
        case 'supernova':
            return '<div class="gift-anim-plasma"></div>';
        case 'quantum_crown':
            return '<div class="gift-anim-crown">👑</div>';
        case 'cyber_unicorn':
            return '<div class="gift-anim-unicorn">🦄</div>';
        case 'moon_rocket':
            return '<div class="gift-anim-rocket">🚀</div>';
        case 'infinite_coffee':
            return '<div class="gift-anim-coffee">☕</div>';
        case 'quantum_diamond':
            return '<div class="gift-anim-diamond">💎</div>';
        default:
            return '<div class="gift-anim-plasma"></div>';
    }
}

function renderGiftCard(gift, container, prepend = false) {
    const spec = GIFT_SPECS[gift.gift_type] || GIFT_SPECS.supernova;
    const card = document.createElement('div');
    card.className = 'gift-card-item card';
    
    let senderText = '';
    if (gift.is_anonymous || !gift.sender) {
        senderText = 'От: <strong>Анонимный поклонник 🎭</strong>';
    } else {
        senderText = `От: <strong class="cursor-pointer" onclick="event.stopPropagation(); openUserProfile(${gift.sender.id})">@${escapeHtml(gift.sender.username)}</strong>`;
    }

    const noteHtml = gift.message ? `<div class="gift-card-note" title="${escapeHtml(gift.message)}">«${escapeHtml(gift.message)}»</div>` : '';

    card.innerHTML = `
        <span class="gift-rarity-pill ${spec.class}">${spec.rarity}</span>
        <div class="gift-stage">
            ${getGiftAnimationHtml(gift.gift_type)}
        </div>
        <div class="gift-card-title">${spec.title}</div>
        <div class="gift-card-sender">${senderText}</div>
        ${noteHtml}
    `;

    card.addEventListener('click', () => {
        openGiftDetail(gift);
    });

    if (prepend && container.firstChild) {
        container.insertBefore(card, container.firstChild);
    } else {
        container.appendChild(card);
    }
    attachCardTilt(card);
}

// ==========================================
// SEND GIFT MODAL & FLOW
// ==========================================
function openCurrentProfileGiftModal() {
    if (currentProfileUserData) {
        openSendGiftModal(currentProfileUserData.id, currentProfileUserData.display_name, currentProfileUserData.username);
    }
}

function openSendGiftModal(receiverId, displayName, username) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Пожалуйста, войдите в аккаунт, чтобы отправить подарок 🎁', 'error');
        openAuthModal('login');
        return;
    }

    if (receiverId === window.CURRENT_USER_ID) {
        showToast('Нельзя отправить подарок самому себе 🙂 Подарите другу!', 'error');
        return;
    }

    soundEngine.playClick();
    document.getElementById('giftReceiverId').value = receiverId;
    document.getElementById('giftReceiverName').textContent = `${displayName} (@${username})`;
    document.getElementById('giftMessage').value = '';
    document.getElementById('giftIsAnonymous').checked = false;
    selectGiftType('supernova');

    const modal = document.getElementById('sendGiftModal');
    if (modal) modal.style.display = 'flex';
}

function closeSendGiftModal() {
    const modal = document.getElementById('sendGiftModal');
    if (modal) modal.style.display = 'none';
}

function selectGiftType(type) {
    soundEngine.playClick();
    document.getElementById('selectedGiftType').value = type;
    document.querySelectorAll('.gift-select-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-type') === type);
    });
}

async function handleSendGiftSubmit(e) {
    e.preventDefault();
    const receiverId = parseInt(document.getElementById('giftReceiverId').value, 10);
    const giftType = document.getElementById('selectedGiftType').value;
    const message = document.getElementById('giftMessage').value.trim();
    const isAnonymous = document.getElementById('giftIsAnonymous').checked;

    try {
        const res = await fetch('/api/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receiver_id: receiverId,
                gift_type: giftType,
                message: message,
                is_anonymous: isAnonymous
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка отправки подарка');

        closeSendGiftModal();
        soundEngine.playGiftFanfare();

        // Celebration confetti burst!
        const btn = document.querySelector('.btn-gift-hero') || document.body;
        const rect = btn.getBoundingClientRect();
        spawnConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
        triggerShockwave();

        showToast(`🎁 Цифровой артефакт «${getGiftTitle(giftType)}» успешно вручен! ✨`, 'success');

        // Если находимся на профиле получателя, обновить подарки
        if (currentProfileUserId === receiverId) {
            loadUserProfile(receiverId);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// UNBOXING / VIEW GIFT DETAIL MODAL
// ==========================================
function openGiftDetail(gift) {
    soundEngine.playGiftFanfare();
    const modal = document.getElementById('giftDetailModal');
    if (!modal) return;

    const spec = GIFT_SPECS[gift.gift_type] || GIFT_SPECS.supernova;

    // Stage
    document.getElementById('unboxingGiftAnimation').innerHTML = getGiftAnimationHtml(gift.gift_type);
    document.getElementById('unboxingTitle').textContent = spec.title;
    const rarityEl = document.getElementById('unboxingRarity');
    rarityEl.textContent = `${spec.rarity} Artifact`;
    rarityEl.className = `unboxing-rarity ${spec.class}`;

    // Sender
    const senderAvatar = document.getElementById('unboxingSenderAvatar');
    const senderName = document.getElementById('unboxingSenderName');
    const senderHandle = document.getElementById('unboxingSenderHandle');

    if (gift.is_anonymous || !gift.sender) {
        senderAvatar.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=MysteryMask';
        senderName.textContent = 'Анонимный доброжелатель 🎭';
        senderHandle.textContent = '@secret_admirer';
    } else {
        senderAvatar.src = gift.sender.avatar_url;
        senderName.textContent = gift.sender.display_name;
        senderHandle.textContent = `@${gift.sender.username}`;
    }

    // Message
    const msgBox = document.getElementById('unboxingMessageBox');
    const msgText = document.getElementById('unboxingMessageText');
    if (gift.message) {
        msgText.textContent = `«${gift.message}»`;
        msgBox.style.display = 'block';
    } else {
        msgBox.style.display = 'none';
    }

    // Date
    document.getElementById('unboxingDate').textContent = formatFullDate(gift.created_at);

    modal.style.display = 'flex';

    // Particle sparks
    const stage = document.getElementById('unboxingGiftAnimation');
    const rect = stage.getBoundingClientRect();
    spawnHearts(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function closeGiftDetailModal() {
    const modal = document.getElementById('giftDetailModal');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// EDIT PROFILE MODAL
// ==========================================
function openEditProfileModal() {
    if (!currentProfileUserData) return;
    soundEngine.playClick();
    document.getElementById('editDisplayName').value = currentProfileUserData.display_name;
    document.getElementById('editBio').value = currentProfileUserData.bio || '';
    document.getElementById('editAvatar').value = currentProfileUserData.avatar_url || '';

    const modal = document.getElementById('editProfileModal');
    if (modal) modal.style.display = 'flex';
}

function closeEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.style.display = 'none';
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const displayName = document.getElementById('editDisplayName').value.trim();
    const bio = document.getElementById('editBio').value.trim();
    const avatarUrl = document.getElementById('editAvatar').value.trim();

    try {
        const res = await fetch('/api/users/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                display_name: displayName,
                bio: bio,
                avatar_url: avatarUrl
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка обновления профиля');

        closeEditProfileModal();
        showToast('Профиль успешно обновлен! ✨', 'success');
        soundEngine.playClick();

        loadUserProfile(window.CURRENT_USER_ID);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// POST FROM PROFILE VIEW
// ==========================================
async function createProfilePost() {
    const textarea = document.getElementById('profPostContent');
    const content = textarea.value.trim();
    if (!content) {
        showToast('Введите текст публикации', 'error');
        return;
    }

    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content,
                image_url: ''
            })
        });

        const post = await res.json();
        if (!res.ok) throw new Error(post.error || 'Ошибка публикации');

        textarea.value = '';
        soundEngine.playPost();
        showToast('Пост опубликован в ваш профиль! 🚀', 'success');

        // Препендим в посты профиля
        const profPosts = document.getElementById('profPostsList');
        if (profPosts) {
            const empty = profPosts.querySelector('.empty-feed-card');
            if (empty) empty.remove();
            const el = createPostElement(post);
            profPosts.insertBefore(el, profPosts.firstChild);
            attachCardTilt(el);
        }

        // Обновить счетчик постов
        const stat = document.getElementById('heroStatPosts');
        if (stat) stat.textContent = parseInt(stat.textContent || '0') + 1;
        const badge = document.getElementById('badgeProfPosts');
        if (badge) badge.textContent = parseInt(badge.textContent || '0') + 1;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// SHOWCASE GIFTS GALLERY
// ==========================================
async function loadShowcaseGifts() {
    const grid = document.getElementById('globalShowcaseGrid');
    if (!grid) return;
    grid.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; padding: 20px; text-align: center;">Загрузка цифровых подарков...</p>';

    try {
        const res = await fetch('/api/gifts/showcase');
        if (!res.ok) throw new Error('Ошибка загрузки подарков');
        const gifts = await res.json();

        grid.innerHTML = '';
        if (!gifts || gifts.length === 0) {
            grid.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; padding: 20px; text-align: center;">В сообществе пока нет подарков. Будьте первыми!</p>';
            return;
        }

        gifts.forEach(gift => {
            renderGiftCard(gift, grid);
        });
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleFollowInProfile(targetUserId) {
    await toggleFollow(targetUserId);
    loadUserProfile(targetUserId);
}
