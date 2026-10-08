# Running the Health Risk App

All commands start from the project folder (`CS4342-Project`).

## Before you start

The app loads the trained models from the `models/` folder. If that folder is empty,
run `Condition_Models.ipynb` first.

## One-time setup

1. Install the Python packages:
   ```
   python -m pip install -r app/requirements.txt
   ```
2. Make sure **Node.js (LTS)** from https://nodejs.org is installed, if not then install it and then restart Code program so the terminal can find it.
   to make sure it worked run `node --version`.
3. Install the frontend packages:
   ```
   cd app/frontend
   npm install
   ```

## Run the app

Open two terminals.

**Terminal 1: backend**
```
python -m uvicorn app.backend.main:app --reload
```

**Terminal 2: frontend**
```
cd app/frontend
npm run dev
```

Open http://localhost:5173 in your browser.

To stop either one, click its terminal and press `Ctrl+C`.

## Run from a single server (optional, for the demo)

```
cd app/frontend
npm run build
```
Then start only the backend (Terminal 1 above) and open http://localhost:8000.
Run `npm run build` again after any change to the frontend.

## Quick checks

- http://localhost:8000/api/health should show `"models_loaded": 20`.
- http://localhost:8000/docs lets you send test requests to the backend without the frontend.

## Common problems

| Problem | Fix |
|---|---|
| `npm` is not recognized | Node.js isn't installed, or VS Code needs a restart after installing it. |
| `No module named ...` | Run the pip install step with the same Python you use to start the backend. |
| Page says it can't reach the risk server | Terminal 1 isn't running, or it stopped with an error. |
