# Settings

`settings.json` is the one place the AI settings live. Change a value, save, and restart the app.

| Setting | What it does |
| --- | --- |
| `model` | The Claude model that writes the questions. |
| `effort` | How hard the model thinks: `low`, `medium`, `high`, `xhigh` or `max`. Higher is slower and costs more. |
| `maxTokens` | The most the model may write for one question, thinking included. |
| `parallelQuestions` | How many questions are written at the same time. |

The API key is **not** here. It lives in `.env.local` (on your laptop) or as an Amplify secret (when deployed), under the name `MCQ_CLAUDE_KEY`.
