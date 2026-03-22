# Setup Telegram Bot

1. Apri Telegram, cerca @BotFather
2. Invia /newbot, scegli nome e username
3. Copia il TOKEN ricevuto

4. Apri @userinfobot su Telegram
5. Invia /start, copia il tuo Chat ID (numero)

6. In GitHub repo > Settings > Secrets > Actions:
   - TELEGRAM_BOT_TOKEN = il token del bot
   - TELEGRAM_CHAT_ID = il tuo chat ID

7. Per usare i comandi interattivi, avvia localmente:
   ```
   cd progetto
   python -m bot_telegram.telegram_bot
   ```

Il bot risponde ai comandi solo dal tuo Chat ID
per sicurezza (check_auth).
