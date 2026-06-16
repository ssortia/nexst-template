# Деплой в продакшен

При публикации GitHub Release автоматически:

1. Собираются Docker-образы `api` и `web`, пушатся в GitHub Container Registry (ghcr.io)
2. GitHub Actions заходит на сервер по SSH и перезапускает контейнеры с новыми образами
3. Контейнер `api` при старте прогоняет `prisma migrate deploy`

---

## Первичная настройка

### 1. GitHub Secrets

Добавьте в репозитории (Settings → Secrets and variables → Actions):

| Секрет                | Описание                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| `SSH_HOST`            | IP или домен сервера                                                            |
| `SSH_USER`            | Пользователь для SSH                                                            |
| `SSH_PRIVATE_KEY`     | Приватный SSH-ключ (публичный — в `~/.ssh/authorized_keys` на сервере)          |
| `CR_PAT`              | GitHub PAT с правом `read:packages` — для pull образов на сервере               |
| `NEXT_PUBLIC_API_URL` | Публичный URL API: `https://app.example.com/api` — вшивается в образ при сборке |

Создайте environment `production` (Settings → Environments) — позволяет ограничить деплой по ревью или ветке.

### 2. DNS

Создай A-запись у регистратора домена:

```
app.example.com → IP-адрес сервера
```

### 3. SSL-сертификат

```bash
sudo apt install certbot

# Порт 80 должен быть свободен
sudo certbot certonly --standalone -d app.example.com
```

Сертификаты сохранятся в `/etc/letsencrypt/live/app.example.com/` — nginx монтирует эту директорию автоматически. Автопродление через `certbot.timer` настраивается при установке.

### 4. Настроить nginx.conf

Замени `app.example.com` на свой домен (4 вхождения):

```bash
sed -i 's/app.example.com/your.domain.com/g' docker/nginx.conf
```

### 5. Подготовить сервер

```bash
sudo mkdir -p /opt/nexst && sudo chown $USER:$USER /opt/nexst

# Скопировать файлы на сервер
scp docker-compose.prod.yml user@server:/opt/nexst/
scp -r docker/ user@server:/opt/nexst/docker/
```

### 6. Переменные окружения

Создай `/opt/nexst/.env` на сервере. Никогда не коммить этот файл.

```env
# База данных
POSTGRES_USER=nexst
POSTGRES_PASSWORD=<сложный пароль>
POSTGRES_DB=nexst_prod

# Redis — openssl rand -base64 32
REDIS_PASSWORD=<сложный пароль>

# JWT — openssl rand -base64 64
JWT_SECRET=<минимум 64 символа>
JWT_REFRESH_SECRET=<другая строка, минимум 64 символа>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# NextAuth — openssl rand -base64 64
NEXTAUTH_SECRET=<минимум 64 символа>
NEXTAUTH_URL=https://app.example.com
```

> `NEXT_PUBLIC_API_URL` задаётся в GitHub Secrets и вшивается в JS-бандл при сборке образа. Изменить его без пересборки (нового Release) нельзя.

---

## Создание релиза

```bash
gh release create v1.0.0 --title "v1.0.0" --notes "Первый релиз"
```

---

## Откат на предыдущую версию

```bash
cd /opt/nexst
GHCR_IMAGE_PREFIX=ghcr.io/owner/repo IMAGE_TAG=v1.0.0 \
  docker compose -f docker-compose.prod.yml up -d
```

---

## Чеклист перед деплоем

### Безопасность

- [ ] Все секреты (JWT_SECRET, NEXTAUTH_SECRET, REDIS_PASSWORD) — случайные строки нужной длины
- [ ] Seed-пользователь (`admin@example.com`) удалён или пароль изменён
- [ ] `.env` не попал в git (`git status`)
- [ ] Swagger (`/api/docs`) отключён или защищён в продакшене

### Инфраструктура

- [ ] SSL-сертификат получен и настроен
- [ ] Настроен мониторинг (uptime checks на `/health`)
- [ ] Настроены бэкапы базы данных

### Приложение

- [ ] `pnpm build` успешно выполняется
- [ ] `pnpm typecheck` без ошибок

---

## Частые проблемы

| Проблема           | Причина                               | Решение                                    |
| ------------------ | ------------------------------------- | ------------------------------------------ |
| API не запускается | Ошибка валидации env                  | `docker compose logs api`                  |
| 502 Bad Gateway    | API или Web не поднялся               | `docker compose ps`, проверить healthcheck |
| CORS ошибки        | `NEXTAUTH_URL` не совпадает с доменом | Проверить значение в `.env`                |
