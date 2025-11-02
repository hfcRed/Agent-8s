<div align="center">

# Agent 8s

[![wakatime](https://wakatime.com/badge/user/7100369a-eb08-483f-96e8-41accea7b5a0/project/5083382e-ed63-41d5-928d-9cc17eda54f6.svg)](https://wakatime.com/badge/user/7100369a-eb08-483f-96e8-41accea7b5a0/project/5083382e-ed63-41d5-928d-9cc17eda54f6)

Discord bot for creating and managing 8s sessions for Splatoon


<img width="683" height="384" alt="with-the-release-of-side-order-we-can-finally-decipher-the-v0-cl3wdi8op1lc1" src="https://github.com/user-attachments/assets/bb2eb7b0-d4af-4842-ae46-ccad5dd9f540" />

[![Generic badge](https://img.shields.io/badge/-Add_Bot_To_Server​-informational?style=for-the-badge)](https://discord.com/oauth2/authorize?client_id=1434173887888887908)

</div>

---

## Setting up the bot on the server

Once you have added the bot to your server there are two things you have to set up:

Under ``Server Settings > Integrations > Agent 8s > Channels`` disable ``All Channels`` and manually add the channels you would like the bot to be used in.  
<img width="40%" height="1100" alt="02-15-00-57-Discord" src="https://github.com/user-attachments/assets/5800db11-6451-4b4a-8b88-74cfb6a35f09" />

Now create two new roles ``Comp 8s`` and ``Casual 8s``. These are the roles the bot will ping when a new event is created.  
<img width="40%" height="1346" alt="02-15-03-20-Discord" src="https://github.com/user-attachments/assets/69ce3f73-cef8-4a47-b262-48df0a5ac7b3" />

### Using the bot

The bot has a single command ``/create`` that can be used in the permitted channels to create a new event. The command allows two optional parameters:

- ``time``: Time in minutes before the event starts. If not specified, event starts when 8 players sign up.
- ``casual``: Whether to ping casual roles.

Users can use the ``Sign Up`` and ``Sign Out`` buttons to enter or exit the event. The creator of the event can also cancel it anytime before it starts. If a time is specified, the creator of the event can also manually start the event before the time is up.

Once an event starts, all participants will be added to a private thread only visible to them and anyone with admin permissions. The creator of the event can then use the ``Finish Event`` button at any time to close the event, which will lock and archive the thread.

Should an event not start because not enough players are found, or the event is not manually finished, the bot will automatically close and archive the event after 24 hours.

## Running locally

### Prerequisites

First, install these programs if you do not have them installed already:

- [Node](https://nodejs.org/en)
- [Git](https://git-scm.com)
- [pnpm](https://pnpm.io/installation)

### Setup app

Go to Discords [developer dashboard](https://discord.com/developers/applications) and create a new application.

Under ``Installation > Default Install Settings`` select the scopes ``applications.commands`` and ``bot`` and the permissions ``Create Private Threads``, ``Manage Threads``, ``Send Messages``, and ``Send Messages in Threads``.

Under ``Bot > Privileged Gateway Intents`` enable ``Presence Intent``, ``Server Members Intent``, and ``Message Content Intent``.

Under ``Bot > Token`` reset your token and copy paste it into the ``.env`` file.

Finally under ``Installation > Install Link`` copy the provided link and use it to invite the bot to your server.

### Commands

- `pnpm install` to install all dependencies

To start testing locally you can use the following commands:

- `pnpm dev` to run the bot locally
- `pnpm run build` to create a build of the bot
