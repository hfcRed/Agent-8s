import http from 'node:http';
import process from 'node:process';
import client from 'prom-client';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

const telemetryDispatchCounter = new client.Counter({
	name: 'telemetry_events_forwarded_total',
	help: 'Count of telemetry events successfully forwarded to the backend',
	labelNames: ['event', 'guild', 'channel'],
	registers: [register],
});

const telemetryFailureCounter = new client.Counter({
	name: 'telemetry_events_failed_total',
	help: 'Count of telemetry events that failed to forward to the backend',
	labelNames: ['event', 'guild', 'channel'],
	registers: [register],
});

const port = Number.parseInt(process.env.METRICS_PORT || '9464', 10);

let serverStarted = false;

function startMetricsServer() {
	if (serverStarted) return;

	const server = http.createServer(async (req, res) => {
		if (!req.url) {
			res.statusCode = 404;
			res.end();
			return;
		}

		if (req.method === 'GET' && req.url === '/metrics') {
			try {
				const metrics = await register.metrics();
				res.writeHead(200, {
					'Content-Type': register.contentType,
					'Cache-Control': 'no-cache, no-store, must-revalidate',
				});
				res.end(metrics);
			} catch (error) {
				res.statusCode = 500;
				res.end('Failed to collect metrics');
				console.error(error);
			}
			return;
		}

		res.statusCode = 404;
		res.end();
	});

	server.listen(port, () => {
		console.log(`Prometheus metrics server listening on :${port}/metrics`);
	});

	server.on('error', (error) => {
		console.error('Metrics server error', error);
	});

	serverStarted = true;
}

startMetricsServer();

export function recordTelemetryDispatch(
	eventName: string,
	guildId: string,
	channelId?: string,
) {
	telemetryDispatchCounter.inc({
		event: eventName,
		guild: guildId,
		channel: channelId || 'unknown',
	});
}

export function recordTelemetryFailure(
	eventName: string,
	guildId: string,
	channelId?: string,
) {
	telemetryFailureCounter.inc({
		event: eventName,
		guild: guildId,
		channel: channelId || 'unknown',
	});
}
