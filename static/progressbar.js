'use strict';

var options = {
  classname: 'progbar',
  id: 'progress-bar',
  target: document.getElementById('progress-bar')
};

var nanobar = new Nanobar(options);

// move bar
//nanobar.go(30); // size bar 30%

var status_div = document.getElementById('status');
var task_id = status_div.dataset.taskid;
var status_url = '/status/' + task_id;

console.log(status_url);

update_progress(status_url, nanobar, status_div);

function update_progress(status_url, nanobar, status_div) {
    // send GET request to status URL
    var xhr = new XMLHttpRequest();
    xhr.open('GET', status_url);
    xhr.onload = function() {
        if (xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);

            console.log(data);

            var percent = parseInt(data['current'] * 100 / data['total']);
            nanobar.go(percent);
            // TODO adjust childNodes
            status_div.textContent = data['status'] + ' ' + percent + '%';

            if (data['state'] != 'PENDING' && data['state'] != 'PROGRESS') {
                if ('video_url' in data) {
                    var video_tag ='<video loop autoplay controls="true" width="100%" height="100%" class="embed-responsive-item shadow_box">\
                    <source src="' + data['video_url'] + '" type="video/mp4">\
                    Your browser does not support the video tag.\
                    </video>';
                    status_div.innerHTML = video_tag;
                }
                // else {
                //     // something unexpected happened
                //     $(status_div.childNodes[3]).text('Result: ' + data['state']);
                // }

                //TODO: Upon Completion Display Converted video and options to DL.
                //TODO: refer to Karaokio.com or Youtube Uploader
                //TODO: refer to karaokio-version for more songs!

            }
            else {
                // rerun in 2 seconds
                setTimeout(function() {
                    update_progress(status_url, nanobar, status_div);
                }, 2000);
            }
        }
    };
    xhr.send();

}
