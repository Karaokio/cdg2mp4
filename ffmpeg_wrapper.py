# Wrap ffmpeg binary in a python script to convert
# cdg+mp3[.zip] file to mp4 video file
import os, zipfile, tempfile
import shutil
import subprocess

class KaraokeConverter:
    def __init__(self, work_dir_id=None, zipfile_path=None):
        self.tempdir = None
        self.zip = None
        self.mp3 = None
        self.cdg = None
        self.mp4 = None

        self.status = None

        if zipfile_path:
            self.set_zip(zipfile_path)
            self.tempdir = work_dir_id
            #TODO: verify

    def create_tempdir(self):
        # If tempdir is already created... use it.
        if not self.tempdir:
            self.tempdir = tempfile.mkdtemp()

        return self.tempdir

    def destroy_tempdir(self):
        if not self.tempdir:
            print("tempdir not set. returning without rm.")
            return None

        shutil.rmtree(self.tempdir)
        self.tempdir = None

    def set_zip(self, zipfile_path):
        self.zip = zipfile.ZipFile(zipfile_path)

    def test_zip(self):
        # 1. Verify self.zip is not None
        # 2. Verify self.zip contains 2 files
        # 3. Verify 2 files are .cdg and .mp3 [or other acceptable]

        if not self.zip:
            print("Missing required file: No Zipfile specified.")
            return False

        if self.zip.testzip() != None:
            print("Some error with zip file")
            return False

        file_list = self.zip.namelist()

        if len(file_list) != 2:
            print("Karaoke Zip requires 2 Files [1 CDG, 1 MP3]")
            return False

        for f in file_list:
            if os.path.splitext(f)[1] in ['.cdg']:
                print("Found CDG: ", os.path.join(self.tempdir, f))
                self.cdg = os.path.join(self.tempdir, f)
            elif os.path.splitext(f)[1] in ['.mp3']:
                print("Found MP3: ", os.path.join(self.tempdir, f))
                self.mp3 = os.path.join(self.tempdir, f)
            else:
                print("Unsupported file format in Zipfile: %s" % f)
                return False
        return True

    def unzip_archive(self):
        if not self.test_zip():
            return False

        self.zip.extractall(path=self.tempdir)

        if os.path.exists(self.mp3) and os.path.exists(self.cdg):
            return True

    def check_ffmpeg(self):
        print("Checking ffmpeg binary installed and version...")
        # subprocess call/check
        try:
            proc = subprocess.run(["ffmpeg", '-version'], stdout=subprocess.PIPE)
            if proc.returncode == 0 and 'ffmpeg version' in str(proc.stdout):
                print('ffmpeg installed and ready')
                return True
        except FileNotFoundError:
            print('ffmpeg binary not found.')
            return False

    def convert_to_mp4(self):
        print("Converting Karaoke Video Files...")
        if not self.check_ffmpeg():
            print("Error with ffmpeg.")
            return False

        # subprocess call/check
        try:
            #TODO: consider doing this in a loop to gather/parse stdout progress
            self.mp4 = os.path.splitext(self.cdg)[0] + '.mp4'
            proc = subprocess.run(["ffmpeg", '-i', self.cdg, '-i', self.mp3, '-f', 'mp4', self.mp4 ], stdout=subprocess.PIPE)
            if proc.returncode == 0 and os.path.exists(self.mp4):
                print('ffmpeg conversion commplete: %s' % self.mp4)
                return True
        except FileNotFoundError:
            print('ffmpeg binary not found.')
            return False

def main(*args, **kwargs):
    print(args, kwargs)

    #set files
    #check
    #convert_to_mp4
    #upload/mv
    #delete tempdir


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('-c', '--cdg', type=argparse.FileType('cdg'))
    parser.add_argument('-m', '--mp3', type=argparse.FileType('mp3'))
    parser.add_argument('-z', '--zip', type=argparse.FileType('zip'))
    parser.add_argument('-o', '--output', type=argparse.FileType('mp4'))
    parser.add_argument('--test-ffmpeg', action='store_true', help='Check ffmpeg binary')
    args = parser.parse_args()

    if args.zip:
        print("got a zipfile. Unzip and examine contents")
    if args.cdg and args.mp3:
        print("got a cdg and an mp3 file. ~attempt conversion to mp4")
        # zip while we're at it for easy downloading/storage

    main(args)
