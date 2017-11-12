from flask import Flask, g, render_template, redirect, url_for
from werkzeug.utils import secure_filename
from flask_uploads import UploadSet, patch_request_class, configure_uploads
from flask_wtf import FlaskForm
from wtforms import SubmitField
from flask_wtf.file import FileField, FileAllowed, FileRequired

#Monitoring
from raven.contrib.flask import Sentry

import os
import secrets


app = Flask(__name__, static_url_path='/static')

#app.config.from_object('yourapplication.default_settings')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'cdg_key_secret_time')


ZIPS = ('zip')
print(os.getcwd())
app.config['UPLOADED_ZIPS_DEST'] = 'media'
zips = UploadSet('zips', ZIPS)
configure_uploads(app, zips)
patch_request_class(app, 20 * 1024 * 1024)

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



    return 'FileSet %s' % fileset_id

# in the case of a 500-error, bring up a Sentry Error Reporting Dialog
@app.errorhandler(500)
def internal_server_error(error):
    return render_template('500.html',
        event_id=g.sentry_event_id,
        public_dsn=sentry.client.get_public_dsn('https')
    )

if __name__ == '__main__':
    app.run(debug=True, use_reloader=True)
