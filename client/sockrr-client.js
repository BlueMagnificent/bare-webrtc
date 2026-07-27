export default async (webSocketUrl) => {
  return new Promise((resolveCB) => {
    const ws = new WebSocket(webSocketUrl);

    ws.addEventListener('open', () => {
      const requestPromises = new Map();

      let requestCallback = null;
      let notificationCallback = null;
      let closeCallback = null;

      const onRequest = (cb) => {
        requestCallback = cb;
      };

      const onNotification = (cb) => {
        notificationCallback = cb;
      };

      const onClose = (cb) => {
        closeCallback = cb;
      };

      const request = (method, data = {}) => {
        return new Promise((resolve, reject) => {
          const requestId = globalThis.crypto.randomUUID();
          const requestPayload = {
            mode: 'request',
            requestId,
            method,
            data,
          };

          requestPromises.set(requestId, { resolve, reject });

          ws.send(JSON.stringify(requestPayload));
        });
      };

      const notify = (method, data = {}) => {
        const notificationPayload = {
          mode: 'notification',
          method,
          data,
        };

        ws.send(JSON.stringify(notificationPayload));
      };

      const handleResponse = ({
        requestId = '',
        data = {},
        isError = false,
        errorMessage = 'request failed',
      }) => {
        const requestPromise = requestPromises.get(requestId);

        if (requestPromise == undefined) return;

        const { resolve, reject } = requestPromise;

        if (isError) reject(errorMessage);
        else resolve(data);

        return;
      };

      const handleRequest = ({ requestId = '', method, data = {} }) => {
        if (!requestCallback) {
          return console.error(
            'sockrr-client::handleRequest() | error: invalid request callback'
          );
        }

        const responseObject = {
          mode: 'response',
          requestId,
        };

        const accept = (responseData = {}) =>
          ws.send(
            JSON.stringify({ ...responseObject, data: responseData }),
            (err) => {
              if (err)
                console.error(
                  'sockrr-client::handleRequest::accept() | error messaging server',
                  err
                );
            }
          );

        const reject = (errorMessage = 'request failed') =>
          ws.send(
            JSON.stringify({ ...responseObject, isError: true, errorMessage }),
            (err) => {
              if (err)
                console.error(
                  'sockrr-client::handleRequest::reject() | error messaging server',
                  err
                );
            }
          );

        if (requestCallback.constructor.name == 'AsyncFunction') {
          requestCallback(method, data, accept, reject).catch((err) => {
            console.error('sockrr-client | onRequest error', err);
          });
        } else {
          try {
            requestCallback(method, data, accept, reject);
          } catch (err) {
            console.error('sockrr-client | onRequest error', err);
          }
        }
      };

      const handleNotification = ({ method, data = {} }) => {
        if (!notificationCallback) {
          return console.error(
            'sockrr-client::handleNotification() | error: invalid notification callback'
          );
        }

        if (notificationCallback.constructor.name == 'AsyncFunction') {
          notificationCallback(method, data).catch((err) => {
            console.error('sockrr-client | onNotification error', err);
          });
        } else {
          try {
            notificationCallback(method, data);
          } catch (err) {
            console.error('sockrr-client | onNotification error', err);
          }
        }
      };

      const onSocketMessage = (evt) => {
        const data = JSON.parse(evt.data);

        if (data.mode) {
          if (data.mode == 'request') handleRequest(data);
          if (data.mode == 'response') handleResponse(data);
          else if (data.mode == 'notification') handleNotification(data);
        }
      };

      const onSocketClose = () => {
        if (!closeCallback) {
          return console.error(
            'sockrr-client::onSocketClose() | invalid close callback'
          );
        }

        closeCallback();
      };

      ws.addEventListener('message', onSocketMessage);
      ws.addEventListener('close', onSocketClose);

      resolveCB({
        request,
        notify,
        onRequest,
        onNotification,
        onClose,
      });
    });
  });
};
