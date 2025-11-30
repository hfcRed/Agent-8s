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

Under ``Server Settings > Integrations > Agent 8s > Channels`` disable ``All Channels`` and manually add the channels you would like the bot commands to be used in.  
<img width="50%" alt="02-15-00-57-Discord" src="https://github.com/user-attachments/assets/5800db11-6451-4b4a-8b88-74cfb6a35f09" />

Now create two new roles ``Comp 8s`` and ``Casual 8s``. These are the roles the bot will ping when a new event is created.  
<img width="50%" alt="02-15-03-20-Discord" src="https://github.com/user-attachments/assets/69ce3f73-cef8-4a47-b262-48df0a5ac7b3" />

If you want to use the bot in a channel that is in a Private Category, make sure to add the bot user to the categories permissions with the "Add members or roles" button. The bot requires this to be able to create voice channels in the category.

The bot can handle automatic deletion of all new messages in a channel that aren't commands. To enable this, add the bot to the channels permissions and give it the permission "Manage Messages". Messages of administrators will not be deleted.

## Using the bot

### Bot commands

#### ``/create``

Create a new 8s event.

- ``time``: Time in minutes before the event starts. If not specified, event starts when 8 players sign up.
- ``casual``: Whether to ping casual roles.
- ``spectators``: Whether to allow spectators for this event.
- ``info``: Add a description to the event.

#### ``/re-ping``

Re-ping the roles for your event.

#### ``/kick``

Kick the selected user from your event.

- ``user``: User to kick

#### ``/toggle-spectators``

Enable or disable spectators for your event. When disabling spectators, all current spectators will be removed from the event.

#### ``/dropout-all``

Remove yourself from all events, queues, and spectator lists. If you own an event, it will be cancelled. This command is useful as an escape hatch if an event gets stuck in an unrecoverable state.

#### ``/status``

Display bot status and statistics.

### Event lifecycle

Users can use the ``Sign Up`` and ``Sign Out`` buttons to enter or exit the event. The creator of the event can also cancel it anytime before it starts. If a time is specified, the creator of the event can also manually start the event before the time is up.

Once an event starts, all participants will be added to a private thread only visible to them and anyone with admin permissions. The creator of the event can then use the ``Finish Event`` button at any time to close the event, which will lock and archive the thread.

After an event has started, users can use the ``Drop In`` and ``Drop Out`` buttons to enter or exit the event.

When an event has started after reaching 8 participants, users can join a waiting queue using the ``Join Queue`` button. Players in the queue will be automatically added to the event when a participant drops out. The queue operates on a first-in-first-out basis. Users can leave the queue at any time using the ``Leave Queue`` button.

If spectators are enabled for an event, up to two users can spectate the event using the ``Spectate`` button. Spectators can stop spectating at any time using the ``Stop Spectating`` button. If a spectator uses the ``Drop In`` button they will be moved from spectators to participants. Spectators can also join the queue, and if promoted from the queue, they will automatically be removed from the spectators list.

If the owner of an event drops out after the event has started, ownership is transferred to the next available person in the event.

Admins can cancel and finish events at any point, even if they are not part of the event.

Should an event not start because not enough players are found, or the event is not manually finished, the bot will automatically close and archive the event after 24 hours.

## Permission scopes

The bot requires a handful of permissions to be granted when added to a server. Disabling permissions is not recommended, and there is no gurantee the bot will be able to function properly without them. Here is a breakdown of all the permissions:

- **Manage Roles**: Required to remove a users access to voice channels if they drop out of an event
- **Manage Channels**: Required to create and delete voice channels
- **View Channels**: Required to view all public channels
- **Send Messages**: Required to reply to commands with a message
- **Send Messages in Threads**: Required to send messages in threads
- **Create Private Threads**: Required to create new private threads
- **Manage Threads**: Required to add/remove users from a thread and close and archive threads
- **Mention @€veryone, @here, and All Roles**: Required to ping the casual and competitive roles
- **Move Members**: Required to disconnect users from voice channels if kicked or dropped out

## Running locally

### Prerequisites

First, install these programs if you do not have them installed already:

- [Node](https://nodejs.org/en)
- [Git](https://git-scm.com)
- [pnpm](https://pnpm.io/installation)

### Setup app

Go to Discords [developer dashboard](https://discord.com/developers/applications) and create a new application.

Under ``Installation > Default Install Settings`` select the scopes ``applications.commands`` and ``bot`` and the permissions ``Create Private Threads``,``Manage Channels``, ``Manage Roles``,  ``Manage Threads``, ``Send Messages``, ``Send Messages in Threads``, and ``View Channels``.

Under ``Bot > Privileged Gateway Intents`` enable ``Presence Intent``, ``Server Members Intent``, and ``Message Content Intent``.

Under ``Bot > Token`` reset your token and copy paste it into the ``.env`` file.

Finally under ``Installation > Install Link`` copy the provided link and use it to invite the bot to your server.

### Commands

- `pnpm install` to install all dependencies

To start testing locally you can use the following commands:

- `pnpm dev` to run the bot locally
- `pnpm run build` to create a build of the bot
- `task test` to compile and execute the automated suite inside Docker

## Environment configuration

- `BOT_TOKEN` (required): Discord bot token used to authenticate the bot.
- `AUTHOR_ID` (optional): The Discord user ID of the bot author/maintainer
- `NODE_ENV` (required): The environment the bot is running in (development or production)
- `TELEMETRY_URL` and `TELEMETRY_TOKEN` (optional): enable forwarding lifecycle telemetry to an external HTTP endpoint.
- `METRICS_PORT` (optional, defaults to `9464`): port exposing the Prometheus `/metrics` endpoint.
- `DATABASE_URL` (optional): PostgreSQL connection string used to persist match lifecycle data to the `telemetry_events` table.
- `DATABASE_SCHEMA` and `TELEMETRY_EVENTS_TABLE` (optional, default to `public.telemetry_events`): override where lifecycle rows are stored; both values must be valid PostgreSQL identifiers.

## Running with Docker

Build the production image (tests run during the multi-stage build):

```bash
docker build -t agent-8s .
```

Run the container with your bot token (and optional telemetry settings):

```bash
docker run --rm \
  -e BOT_TOKEN=your_token_here \
  -e TELEMETRY_URL=optional_url \
  -e TELEMETRY_TOKEN=optional_token \
  -e METRICS_PORT=9464 \
  -e DATABASE_URL=optional_postgres_connection_string \
  agent-8s
```

You can also supply environment values from a file:

```bash
docker run --rm --env-file .env agent-8s
```

## Telemetry & Metrics

- The bot exposes a Prometheus endpoint on `/metrics` and a `/healthz` health check bound to `0.0.0.0`. Override the port with `METRICS_PORT` (defaults to `9464`).
- Metric names are prefixed with `agent8s_{env}`, where `env` is `prod` when `NODE_ENV=production` and `dev` otherwise: `agent8s_{env}_interactions_total{type}`, `agent8s_{env}_errors_total{reason,severity}`, `agent8s_{env}_telemetry_events_forwarded_total{event,guild,channel}`, and `agent8s_{env}_telemetry_events_failed_total{event,guild,channel}`.
- Guild and channel labels fall back to `unknown` whenever the IDs cannot be resolved (for example, when telemetry is triggered outside a guild context).
- The metrics endpoint is available even when remote telemetry is disabled, allowing local scraping without forwarding events.
- Provide `DATABASE_URL` (and optional `DATABASE_SCHEMA`/`TELEMETRY_EVENTS_TABLE`) to persist lifecycle events in PostgreSQL. The bot prepares the target schema/table on startup and records match UUIDs, guild/channel IDs, user/participant identifiers, payload JSON, and timestamps for each lifecycle hook.

## Task shortcuts

Install [Task](https://taskfile.dev) and use the provided helpers:

- `task test` runs the Docker test stage to compile sources and execute the Node test suite.
- `task docker:build` runs the test stage and then builds the runtime image using the repository Dockerfile.
- `task docker:run BOT_TOKEN=your_token_here` runs the container with the required token (add `TELEMETRY_URL`/`TELEMETRY_TOKEN` as needed). Append `DETACH=true` to run in the background.
- `task docker:run-env-file` runs the container with environment values from `.env` or a custom file via `ENV_FILE=path/to/file`.
- `task docker:down` stops the running container (defaults to `agent-8s`; override with `CONTAINER_NAME=name`).
- `task docker:destroy-image` removes the current image (if present) and prunes dangling layers.
- `task docker:update-run` stops the container, rebuilds the image, and runs it again using `.env` by default; accepts the same overrides as the other Docker tasks.

All Docker tasks respect `IMAGE_NAME` and `CONTAINER_NAME` overrides if you need to run multiple variants side by side.
