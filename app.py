#Karaokio CDG-2-MP4 Flask App
#Flask Webframework
from flask import Flask, g, render_template, redirect, url_for, jsonify, send_from_directory, request
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
import urllib.request
from urllib.parse import quote
import os, time, random, json
import boto3
import secrets


app = Flask(__name__, static_url_path='/static')

#app.config.from_object('yourapplication.default_settings')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'cdg_key_secret_time')

# File Uploads Settings
ZIPS = ('zip')
app.config['UPLOADED_ZIPS_DEST'] = 'media'
app.config['UPLOADED_ZIPS_URL'] = "/videos/"
zips = UploadSet('zips', ZIPS)
configure_uploads(app, zips)
patch_request_class(app, 20 * 1024 * 1024)

# Celery Config
if 'DYNO' in os.environ:
    # Indicates Heroku environ
    print('detected Heroku Deployment')
    debug = False
    app.config['CELERY_BROKER_URL'] = os.environ.get('RABBITMQ_BIGWIG_URL', 'amqp://') #redis?
    app.config['CELERY_RESULT_BACKEND'] = os.environ.get('RABBITMQ_BIGWIG_URL', 'amqp') #redis?
else:
    #Local Dev
    print("detected Local Deploy")
    debug = True
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

# Sign s3 file for upload to bucket
@app.route('/sign_s3/')
def sign_s3():
  S3_BUCKET = os.environ.get('CDG_AWS_STORAGE_BUCKET_NAME')

  file_name = request.args.get('file_name')
  file_type = request.args.get('file_type')

  s3 = boto3.client('s3')

  dir_id = secrets.token_hex()

  presigned_post = s3.generate_presigned_post(
    Bucket = S3_BUCKET,
    Key = os.path.join(dir_id, file_name),
    Fields = {"acl": "public-read", "Content-Type": file_type},
    Conditions = [
      {"acl": "public-read"},
      {"Content-Type": file_type}
    ],
    ExpiresIn = 3600
  )

  return json.dumps({
    'data': presigned_post,
    'url': 'https://%s.s3.amazonaws.com/%s' % (S3_BUCKET, os.path.join(dir_id, file_name)),
    'dir_id': dir_id,
  })

# Custom static data
@app.route('/videos/<path:filename>')
def custom_static(filename):
    if filename.startswith('media/'):
        return send_from_directory('.', filename)
    return redirect(url_for('upload'))

class UploadForm(FlaskForm):
    cdg_zip = FileField(validators=[FileAllowed(zips, u'Zip files only!'), FileRequired(u'File was empty!')])
    submit = SubmitField(u'Upload')

@app.route('/', methods=['GET', 'POST'])
def index():
    form = UploadForm()
    return render_template('index.html', form=form)

@app.route('/convert', methods=['GET', 'POST'])
def start_conversion():
    if request.method == 'POST':
        file_url = request.json.get('zip_url', None)
        dir_id = request.json.get('dir_id', None)

        if not file_url or not dir_id:
            # TODO: return more error codes
            return json.dumps({'task_id': None,})

        task = process_file_from_url.apply_async((file_url, dir_id))

        return json.dumps({'task_id': task.id, 'file_url': file_url, 'dir_id': dir_id, })

    # TODO: return more error codes
    return json.dumps({'task_id': None,})


@app.route('/video/<fileset_id>/')
def show_fileset(fileset_id):
    task_id = request.args.get('task_id', None)

    # http://boto3.readthedocs.io/en/latest/reference/services/s3.html#S3.Client.upload_file
    S3_BUCKET = os.environ.get('CDG_AWS_STORAGE_BUCKET_NAME')
    s3 = boto3.client('s3')
    s3_r= boto3.resource('s3')
    bucket = s3_r.Bucket(S3_BUCKET)
    dir_listing = {}
    for file_obj in bucket.objects.filter(Prefix=fileset_id):
        # Get the service client.
        # Generate the URL to get 'key-name' from 'bucket-name'
        url = s3.generate_presigned_url(
            ClientMethod='get_object',
            Params={
                'Bucket': S3_BUCKET,
                'Key': file_obj.key
            }, ExpiresIn=60*60*24*7
        )
        # get file extention
        ext = os.path.splitext(file_obj.key)[1][1:]
        dir_listing['%s_file_url' % ext] = url

    return render_template('video_detail.html',
            fileset_id=fileset_id, task_id=task_id,
            mp4_file_url=dir_listing.get('mp4_file_url', None),
            zip_file_url=dir_listing.get('zip_file_url', None) )

@app.route('/status/<task_id>')
def taskstatus(task_id):
    task = process_file_from_url.AsyncResult(task_id)
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
        if 'video_url' in task.info:
            response['video_url'] = task.info['video_url']
        if 'mp4_file_url' in task.info:
            response['mp4_file_url'] = task.info['mp4_file_url']
        if 'zip_file_url' in task.info:
            response['zip_file_url'] = task.info['zip_file_url']

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
def process_file_from_url(self, file_url, dir_id):
    print("In Process Files")
    """Background task that runs a long function with status updatws."""
    verb = ['Starting up', 'Checking Files', 'Unzipping', 'Converting', 'Finalizing']
    message = ''
    total = 100

    # TODO set/download zip from URL
    message = "Configuring Karaoke Converter..."
    self.update_state(state='PROGRESS',
                      meta={'current': 5, 'total': total,
                            'status': message})

    print("Info:", file_url, dir_id)

    # Download the file from `url` and save it locally under `file_name`:
    work_dir = os.path.join('media', dir_id)
    zipfile_path = os.path.join(work_dir, "%s.zip" % dir_id)

    if not os.path.exists(work_dir):
        os.makedirs( work_dir);

    with urllib.request.urlopen(quote(file_url, safe=':/?*=\'')) as response, open(zipfile_path, 'wb') as out_file:
        data = response.read() # a `bytes` object
        out_file.write(data)

    k = KaraokeConverter(work_dir_id=work_dir, zipfile_path=zipfile_path)

    if not zipfile_path:
        return {'current': 100, 'total': total, 'status': 'Error: No CDG.zip File specified.',
                'result': 500}

    message = "Retrieved Files..."
    self.update_state(state='PROGRESS',
                      meta={'current': 10, 'total': total,
                            'status': message})

    if not k.check_ffmpeg():
        return {'current': 100, 'total': total, 'status': 'Error: Failed starting ffmpeg. Please try again later.',
                'result': 500}

    message = "ffmpeg binary configured"
    self.update_state(state='PROGRESS',
                      meta={'current': 15, 'total': total,
                            'status': message})

    message = "Starting Karaoke Convertor..."
    self.update_state(state='PROGRESS',
                      meta={'current': 20, 'total': total,
                            'status': message})

    if not k.test_zip():
        k.destroy_tempdir()
        return {'current': 100, 'total': total, 'status': 'Error processing Zip Archive contents.',
                'result': 500}


    message = "Unzipping Zipfile..."
    self.update_state(state='PROGRESS',
                      meta={'current': 25, 'total': total,
                            'status': message})

    if not k.unzip_archive():
        k.destroy_tempdir()
        return {'current': 100, 'total': total, 'status': 'Error: Failed unzipping Zip Archive contents.',
                'result': 500}

    message = "Converting CDG File to MP4..."
    self.update_state(state='PROGRESS',
                      meta={'current': 40, 'total': total,
                            'status': message})

    if not k.convert_to_mp4():
        print("Failed to convert")
        k.destroy_tempdir()
        return {'current': 100, 'total': total, 'status': 'Error: Failed converting Karaoke Files.',
                'result': 500}

    #TODO: launch another meta-data processing
    #TODO: notify other APIs
    #TODO: optionally upload to another server (or Youtube, Bitchute, etc)
    #TODO: optionally send off email

    # TODO: save new files back to S3
    message = "Saving converted video..."
    self.update_state(state='PROGRESS',
                      meta={'current': 50, 'total': total,
                            'status': message})

    # http://boto3.readthedocs.io/en/latest/reference/services/s3.html#S3.Client.upload_file
    S3_BUCKET = os.environ.get('CDG_AWS_STORAGE_BUCKET_NAME')
    s3 = boto3.client('s3')
    s3.upload_file(k.mp4, S3_BUCKET, os.path.join(dir_id, os.path.basename(k.mp4)))
    s3_url_mp4 = s3.generate_presigned_url('get_object', Params = {'Bucket': S3_BUCKET, 'Key': os.path.join(dir_id, os.path.basename(k.mp4)),}, ExpiresIn=60*60*24*7)


    # List the files.
    s3_r= boto3.resource('s3')
    bucket = s3_r.Bucket(S3_BUCKET)
    dir_listing = {}
    for file_obj in bucket.objects.filter(Prefix=dir_id):
        # Get the service client.
        # Generate the URL to get 'key-name' from 'bucket-name'
        url = s3.generate_presigned_url(
            ClientMethod='get_object',
            Params={
                'Bucket': S3_BUCKET,
                'Key': file_obj.key
            }, ExpiresIn=60*60*24*7
        )

        # get file extention
        ext = os.path.splitext(file_obj.key)[1][1:]
        dir_listing['%s_file_url' % ext] = url

    status_dict = {'current': 100, 'total': 100, 'status': 'Karaoke Conversion complete!',
            'video_url': s3_url_mp4,
            'session_id': dir_id,
            'result': 42}

    status_dict.update(dir_listing)

    print("Done!", k.mp4)
    return status_dict


if __name__ == '__main__':
    app.run(debug=True, use_reloader=True)
