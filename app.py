#Flask Webframework
from flask import Flask, g, render_template, redirect, url_for, jsonify
from werkzeug.utils import secure_filename
from flask_uploads import UploadSet, patch_request_class, configure_uploads
from flask_wtf import FlaskForm
from wtforms import SubmitField
from flask_wtf.file import FileField, FileAllowed, FileRequired

#Celery - Long Running Tasks
from celery import Celery

## KaraokeConverter (FFMPEG Functionality)
from ffmpeg_wrapper import KaraokeConverter

#Monitoring
from raven.contrib.flask import Sentry

#Other
import os, time, random
import secrets


app = Flask(__name__, static_url_path='/static')

#app.config.from_object('yourapplication.default_settings')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'cdg_key_secret_time')

# File Uploads Settings
ZIPS = ('zip')
app.config['UPLOADED_ZIPS_DEST'] = 'media'
zips = UploadSet('zips', ZIPS)
configure_uploads(app, zips)
patch_request_class(app, 20 * 1024 * 1024)

# Celery Config
app.config['CELERY_BROKER_URL'] = os.environ.get('CELERY_BROKER_URL', 'amqp://') #redis?
app.config['CELERY_RESULT_BACKEND'] = os.environ.get('CELERY_RESULT_BACKEND', 'amqp') #redis?
celery = Celery(app.name, broker=app.config['CELERY_BROKER_URL'])
celery.conf.update(app.config)

#Monitoring
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



class UploadForm(FlaskForm):
    cdg_zip = FileField(validators=[FileAllowed(zips, u'Zip files only!'), FileRequired(u'File was empty!')])
    submit = SubmitField(u'Upload')

@app.route('/', methods=['GET', 'POST'])
def upload():
    form = UploadForm()
    if form.validate_on_submit():
        id = secrets.token_hex()
        filename = zips.save(form.cdg_zip.data, folder=id)
        file_url = zips.url(filename)
        return redirect(url_for('show_fileset', fileset_id=id))

    return render_template('index.html', form=form)

@app.route('/video/<fileset_id>')
def show_fileset(fileset_id):
    # show the post with the given id, the id is an integer

    # Kick off Celery Task
    task = process_files.apply_async()
    print(task)
    print(task.id)

    return render_template('video_detail.html', fileset_id=fileset_id, task_id=task.id)

@app.route('/status/<task_id>')
def taskstatus(task_id):
    task = process_files.AsyncResult(task_id)
    if task.state == 'PENDING':
        # job did not start yet
        response = {
            'state': task.state,
            'current': 0,
            'total': 1,
            'status': 'Pending...'
        }
    elif task.state != 'FAILURE':
        response = {
            'state': task.state,
            'current': task.info.get('current', 0),
            'total': task.info.get('total', 1),
            'status': task.info.get('status', '')
        }
        if 'result' in task.info:
            response['result'] = task.info['result']
    else:
        # something went wrong in the background job
        response = {
            'state': task.state,
            'current': 1,
            'total': 1,
            'status': str(task.info),  # this is the exception raised
        }
    return jsonify(response)

# in the case of a 500-error, bring up a Sentry Error Reporting Dialog
@app.errorhandler(500)
def internal_server_error(error):
    return render_template('500.html',
        event_id=g.sentry_event_id,
        public_dsn=sentry.client.get_public_dsn('https')
    )

@app.route('/test/task', methods=['GET'])
def test_task():
    result = sum.delay(23, 42)
    result.wait()
    return jsonify(result.result)

@app.route('/test/ffmpeg', methods=['GET'])
def test_ffmpeg():
    result = test_ffmpeg.delay()
    result.wait()
    return jsonify(result.result)


# Celery Tasks
@celery.task()
def sum(a, b):
    return a + b

@celery.task()
def test_ffmpeg():
    if not KaraokeConverter().check_ffmpeg():
        return "ffmpeg error."

    return "ffmpeg ready."

@celery.task(bind=True)
def process_files(self):
    """Background task that runs a long function with status updatws."""
    verb = ['Starting up', 'Checking Files', 'Unzipping', 'Converting', 'Finalizing']
    message = ''
    total = random.randint(10, 50)
    for i in range(total):
        if not message or random.random() < 0.25:
            message = '{0}...'.format(random.choice(verb))
        print("updating... message")
        # TODO: Call Karaokio
        self.update_state(state='PROGRESS',
                          meta={'current': i, 'total': total,
                                'status': message})
        time.sleep(1)
    return {'current': 100, 'total': 100, 'status': 'Task completed!',
            'result': 42}


if __name__ == '__main__':
    app.run(debug=True, use_reloader=True)
