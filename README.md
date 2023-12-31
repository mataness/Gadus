
# Gadus

Face recognition bot for WhatsApp that forwards images with detected faces to another WhatsApp chat

  

## Running the bot

1. Clone the repo

2. Run *docker build REPO_FOLDER_PATH -t gadus* (replace REPO_FOLDER_PATH with the full path to where you downloaded the repo)

3. Open the *Gadus.config* file and edit the configuration parameters according to your own values.

4. Run *docker run --name gadus --env-file Gadus.config -d -v {WHATSAPP_CACHED_CREDNTIALS_FOLDER}:/opt/whatsapp_auth gadus* where WHATSAPP_CACHED_CREDNTIALS_FOLDER is a full path to a folder that will be used by the container to store and reuse WhatsApp credentials. Simply create a new empty folder and use it. e.g. C:\temp\GadusCreds or /home/user/gadus_creds if you are running on linux. For the given example, the command would be docker run --name gadus --env-file Gadus.config -d -v C:\temp\GadusCreds:/opt/whatsapp_auth gadus

5. Check the running container console logs using *docker logs gadus*, it should give you a URL to scan QR code, you need to scan the QR code with the mobile phone connected to the WhatsApp account which the bot will use

6. Once the bot is running, send a '!ping' message to the bot to make sure its online. If the bot is running on your WhatsApp number, just send the message to yourself.

  

## Setting up face recognition

  

### Controlling the bot

1. The bot can be controlled by sending command messages to the bot. If the bot is running on your WhatsApp number, just send them to yourself.

2. The bot can also be controlled via REST API (documentation WIP)

  

### Terminology

1. Source chat - the chat where the bot will sample incoming pictures and run the face recognition

2. Destination chat- that chat where detected images in the source chat will be forwarded by the bot

3. Face name - a user friendly name of the face to recognize

4. Owner WhatsApp number - the number of the WhatsApp user that will control the face and will be able to train the bot by supplying training images.

  

### Add new face for recognition

Send the following command messages to the bot to add new face.

You will need to get the source chat ID and destination chat ID, which cannot be seen through WhatsApp standard UI, so we will use the bot to get them by running the '!listchat {chat name}' command:

1. !searchchat {source chat name} - e.g. '!listchats הגן של שולה'

2. !searchchat {destination chat name} e.g. '!listchats תמונות של עומר'

3. To add the face: !fmanage add {owner WhatsAppNumber e.g. 972544123456} {Face friendly name e.g. John} {source WhatsApp chat ID e.g. 12345676799@g.us} {destination WhatsApp chat ID e.g. 123456762323799@g.us}

4. The bot will reply that the face was added

5. Now to train the bot on the newly added face, send the bot clear pictures of the person. The person face should be clear and the pictures should not contain faces of any other person.

  

## Known issues

There's a known issue with the underlying whatsapp-web.js library that fails to forward messages, https://github.com/pedroslopez/whatsapp-web.js/issues/2426 .

The temp fix for the issue is manually editing the library code. Go to node_modules -> whatsapp-web.js -> src -> structures -> Message.js

Search for line 385 and replace the implementation of the forward(chat) method with:

```

const chatId = typeof chat === 'string' ? chat : chat.id._serialized;

  

await this.client.pupPage.evaluate(async (msgId, chatId) => {

let msg = window.Store.Msg.get(msgId);

let chat = window.Store.Chat.get(chatId);

window.Store.Chat.forwardMessagesToChats([msg],[chat]);

}, this.id._serialized, chatId);

```