# Gadus
Face recognition bot for WhatsApp that forwards images with detected faces to another WhatsApp chat

## Running the bot
1. Clone the repo
2. Run npm install
3. Run tsc (compile the typscript code)
4. Run node assets/index.js --AzureFaceApiKey "FaceApiKey" --AzureFaceEndoint "https://{yourface endpoint}.cognitiveservices.azure.com/" --AzureStorageAccountKey "Storage account key" --AzureStorageAccountName "Storage account name"
5. Check the running node application console logs, it should give you a URL to scan QR code, you need to scan the QR code with the mobile phone connected to the WhatsApp account which the bot will use
