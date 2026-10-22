# AI Detective Frontend

React + Tailwind developer view connected to the AI Detective Python API.

The dashboard is independent from the core Python CLI. It calls the optional
`services/live_gateway` service, which detects an existing backend and reads its accessible log source.

## Run locally

Start the separate gateway first:

```powershell
& .\.venv\Scripts\python.exe -m pip install -e .
& .\.venv\Scripts\python.exe -m pip install -e .\services\live_gateway
Copy-Item .\services\live_gateway\.env.example .\services\live_gateway\.env
& .\.venv\Scripts\python.exe -m uvicorn live_gateway.api:app --app-dir services/live_gateway/src --port 8000
```

Then start the dashboard in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The gateway does not start your backend. Start the backend separately, then use the dashboard to
select or enter its URL and the URL that exposes its logs:

```dotenv
AI_DETECTIVE_ALLOW_REMOTE_SOURCE=false
```

The dashboard automatically probes `http://127.0.0.1:5000` and `http://127.0.0.1:3000`. The log
source can be any HTTP endpoint returning plain text or JSON logs; it does not have to be named
`/logs`. Once the backend responds, the dashboard refreshes the analysis every five seconds.

The API defaults to `http://127.0.0.1:8000`. Override it with:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Build

```powershell
npm run build
```
