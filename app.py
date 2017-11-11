from flask import Flask, g, render_template

from flask_uploads import ARCHIVES, UploadSet

from raven.contrib.flask import Sentry

from datetime import datetime

app = Flask(__name__, static_url_path='/static')

sentry = Sentry(app) # dsn=SENTRY_DSN (env)

## Sentry Notes:
# https://docs.sentry.io/clients/python/integrations/flask/
# 1) Capturing arbitrary exceptions and sending them to Sentry
# try:
#     1 / 0
# except ZeroDivisionError:
#     sentry.captureException()
# 2) or generic Message:
# sentry.captureMessage('hello, world!')

@app.route('/')
def homepage():
    return render_template('index.html')

@app.route('/test')
def testing():
    the_time = datetime.now().strftime("%A, %d %b %Y %l:%M %p")

    return """
    <h1>Karaokio - CDG~2~MP4 Conversion</h1>
    <p>Testing</p>"""


# in the case of a 500-error, bring up a Sentry Error Reporting Dialog
@app.errorhandler(500)
def internal_server_error(error):
    return render_template('500.html',
        event_id=g.sentry_event_id,
        public_dsn=sentry.client.get_public_dsn('https')
    )

if __name__ == '__main__':
    app.run(debug=True, use_reloader=True)
