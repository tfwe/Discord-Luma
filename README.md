# Discord-Luma

A feature-rich Discord bot built with Node.js and Python. It features Large Language Model (LLM) integration, audio transcription capabilities, and a hybrid backend that bridges JavaScript and Python execution.

## Features

*   **Slash Commands:** Includes a modular command handler (e.g., `/set`) and deployment script.
*   **LLM Integration:** Built-in utilities for interacting with LLMs, managing system prompts, and tracking token usage.
*   **Audio Transcription:** Automated audio transcription tools integrated directly into the bot's workflow.
*   **Hybrid Execution:** Utilizes a Node.js core with a Python virtual environment to execute specialized Python scripts seamlessly.
*   **Custom Logging:** Dedicated logging utility for monitoring bot activity and message interactions.

## Tech Stack

*   **Node.js:** Core bot logic, Discord API interactions, and routing.
*   **Python (3.11):** Virtual environment (`venv`) for executing backend Python scripts.

## Prerequisites

*   Node.js (v16.x or higher recommended)
*   Python 3.11

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/tfwe/Discord-Luma.git
    cd Discord-Luma
    ```

2.  **Install Node dependencies:**
    ```bash
    npm install
    ```

3.  **Setup the Python Virtual Environment:**
    ```bash
    # Activate the existing venv or create a new one
    source venv/bin/activate  # On Windows use: venv\Scripts\activate
    
    # Install necessary Python dependencies
    pip install --upgrade pip
    ```

4.  **Configuration:**
    *   Copy the example environment file to create your own configuration:
        ```bash
        cp example.env .env
        ```
    *   Populate `.env` with your Discord bot token, necessary API keys (for LLM and transcription services), and other required variables.
    *   Review `config.json` to configure specific server rules or bot parameters.

## Usage

1.  **Deploy Commands:**
    You must register your slash commands with the Discord API before starting the bot for the first time, or whenever you add new commands.
    ```bash
    node deploy-commands.js
    ```

2.  **Start the Bot:**
    ```bash
    node bot.js
    ```

## Project Structure

*   `bot.js`: Main entry point and initialization script.
*   `commands/`: Contains slash command definitions (e.g., `set.js`).
*   `interactions/`: Event handlers, including `messageCreate.js`.
*   `utils/`: Core backend utilities including `llmRequests.js`, `pythonExecutor.js`, and `transcription.js`.
*   `token_usage.json`: Tracks and logs LLM token consumption.
*   `venv/`: Python 3.11 virtual environment for Python-specific execution.

## License

[MIT](https://choosealicense.com/licenses/mit/)
