# 집잡아(JipJaba) 배포 가이드

이 앱은 두 부분으로 나뉘어 배포됩니다:

| 구성요소 | 호스트 | 이유 |
|---|---|---|
| **Next.js 프론트엔드 + API 라우트** | **Vercel** | 정적/Edge·Node 서버리스에 최적 |
| **Python 에이전트 서비스** (`agents/server.py`) | **Railway / Render / Fly / Docker** | Vercel 서버리스는 Python 실행·프로세스 spawn 불가 |

Next.js 라우트(`/api/chat`, `/api/crm`)는 환경변수 **`AGENT_SERVICE_URL`** 이 설정되면 그 Python 서비스로 HTTP 프록시하고, 없으면 로컬 개발용으로 Python 서브프로세스를 실행합니다.

---

## 1단계 — Python 에이전트 서비스 배포

서비스는 다음 엔드포인트를 제공합니다: `GET /health`, `POST /chat`(NDJSON 스트림), `GET /crm`.

### 옵션 A) Railway (가장 빠름)
1. GitHub에 이 저장소를 푸시.
2. Railway → **New Project → Deploy from GitHub repo**.
3. Railway가 루트 `requirements.txt` + `Procfile`을 감지해 빌드/실행합니다.
   - 시작 명령: `uvicorn agents.server:app --host 0.0.0.0 --port $PORT`
4. **Variables**에 환경변수 추가:
   - `ANTHROPIC_API_KEY`
   - `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME=Consultations`
   - (선택) `INTENT_MODEL`, `RESPONSE_MODEL`, `SUGGEST_MODEL`
5. **메모리 영속화(권장):** Volume을 추가(예: 마운트 경로 `/data-persist`)하고
   `JIPJABA_CHECKPOINT_PATH=/data-persist/checkpoints.sqlite` 설정. (미설정 시 인스턴스
   재시작마다 대화 메모리 초기화됨.)
6. 배포 후 공개 URL 확인 → 예: `https://jipjaba-agents.up.railway.app`
7. 헬스 체크: `curl https://.../health` → `{"ok":true,...}`

### 옵션 B) Render
- **New → Web Service** → 저장소 연결.
- Runtime: Docker (루트 `Dockerfile` 사용) **또는** Python(루트 `requirements.txt` + Start Command `uvicorn agents.server:app --host 0.0.0.0 --port $PORT`).
- 환경변수는 위와 동일. 영속 디스크(Disk)를 붙이고 `JIPJABA_CHECKPOINT_PATH`를 그 경로로.

### 옵션 C) Docker (Fly.io 등)
```bash
docker build -t jipjaba-agents .
docker run -p 8000:8000 \
  -e ANTHROPIC_API_KEY=... \
  -e AIRTABLE_API_KEY=... -e AIRTABLE_BASE_ID=... \
  jipjaba-agents
```

---

## 2단계 — Vercel에 프론트엔드 배포

```bash
# 프로젝트 루트에서
vercel            # 최초: 프로젝트 연결/생성 (프리뷰 배포)
vercel --prod     # 프로덕션 배포
```

또는 Vercel 대시보드에서 GitHub 저장소를 import (프레임워크 자동 감지: Next.js).

### Vercel 환경변수 (Project → Settings → Environment Variables)
- **`AGENT_SERVICE_URL`** = 1단계에서 받은 Python 서비스 URL (예: `https://jipjaba-agents.up.railway.app`)

> 프론트엔드 자체는 `ANTHROPIC_API_KEY`/Airtable 키가 필요 없습니다. 모든 LLM·CRM 호출은
> Python 서비스에서 일어납니다. (키를 Vercel에 둘 필요 없음 = 노출면 축소)

`AGENT_SERVICE_URL` 설정 후 재배포하면 채팅이 원격 서비스로 연결됩니다.

---

## 배포 순서 요약
1. Python 서비스 먼저 배포 → URL 확보 → `/health` 확인.
2. Vercel에 `AGENT_SERVICE_URL` 설정 → `vercel --prod`.
3. 배포된 사이트에서 채팅/관리자 대시보드 동작 확인.

## 참고 / 한계
- **CORS:** 서비스는 `*` 허용. 서버-투-서버 프록시가 기본 경로라 보통 무관.
- **메모리 영속화:** SqliteSaver는 단일 인스턴스 디스크 기준. 다중 인스턴스로
  스케일하면 Postgres 체크포인터(`langgraph-checkpoint-postgres`)로 교체 권장.
- **로컬 개발:** `.env`에 키를 넣고 `npm run dev`만 실행하면 `AGENT_SERVICE_URL`
  미설정 → Python 서브프로세스 폴백으로 그대로 동작.
