import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';

export default (httpServer) => {
  let newClientCallback = null;

  const onNewClient = (cb) => {
    newClientCallback = cb;
  };

  const ws = new WebSocketServer({ server: httpServer });

  ws.on('connection', (wsConn) => {
    try {
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

      const requestPromises = new Map();

      const request = (method, data = {}) => {
        return new Promise((resolve, reject) => {
          const requestId = crypto.randomUUID();
          const requestPayload = {
            mode: 'request',
            requestId,
            method,
            data,
          };

          requestPromises.set(requestId, { resolve, reject });

          wsConn.send(JSON.stringify(requestPayload));
        });
      };

      const notify = (method, data = {}) => {
        const notificationPayload = {
          mode: 'notification',
          method,
          data,
        };

        wsConn.send(JSON.stringify(notificationPayload));
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
            'sockrr-server::handleRequest() | error: invalid request callback'
          );
        }

        const responseObject = {
          mode: 'response',
          requestId,
        };

        const accept = (responseData = {}) =>
          wsConn.send(
            JSON.stringify({ ...responseObject, data: responseData }),
            (err) => {
              if (err)
                console.error(
                  'sockrr-server::handleRequest::accept() | error messaging client',
                  err
                );
            }
          );

        const reject = (errorMessage = 'request failed') =>
          wsConn.send(
            JSON.stringify({ ...responseObject, isError: true, errorMessage }),
            (err) => {
              if (err)
                console.log(
                  'sockrr-server::handleRequest::reject() | error messaging client',
                  err
                );
            }
          );

        if (requestCallback.constructor.name == 'AsyncFunction') {
          requestCallback(method, data, accept, reject).catch((err) => {
            console.error('sockrr-server | onRequest error', err);
          });
        } else {
          try {
            requestCallback(method, data, accept, reject);
          } catch (err) {
            console.error('sockrr-server | onRequest error', err);
          }
        }
      };

      const handleNotification = ({ method, data = {} }) => {
        if (!notificationCallback) {
          return console.error(
            'sockrr-server::handleNotification() | error: invalid notification callback'
          );
        }

        if (notificationCallback.constructor.name == 'AsyncFunction') {
          notificationCallback(method, data).catch((err) => {
            console.error('sockrr-server | onNotification error', err);
          });
        } else {
          try {
            notificationCallback(method, data);
          } catch (err) {
            console.error('sockrr-server | onNotification error', err);
          }
        }
      };

      const onSocketMessage = (d) => {
        const data = JSON.parse(d);

        if (data.mode) {
          if (data.mode == 'request') handleRequest(data);
          if (data.mode == 'response') handleResponse(data);
          else if (data.mode == 'notification') handleNotification(data);
        }
      };

      const onSocketClose = () => {
        if (!closeCallback) {
          return console.error(
            'sockrr-server::onSocketClose() | error: invalid close callback'
          );
        }

        closeCallback();
      };

      wsConn.on('message', onSocketMessage);
      wsConn.on('close', onSocketClose);

      if (!newClientCallback) {
        return console.error(
          'sockrr-server::ws on "connection" | error: invalid new client callback'
        );
      }

      newClientCallback({
        request,
        notify,
        onRequest,
        onNotification,
        onClose,
      });
    } catch (error) {
      console.error('sockrr-server::ws on "connection" |', error);
    }
  });

  return {
    onNewClient,
  };
};
