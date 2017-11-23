"use strict";

// https://codepen.io/liladas/pen/rYyXmY

function readURL(input) {
  // read the url, grab the filename, display in box
  if (input.files && input.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var file_data = e.target.result;
      var file_name = input.files[0].name;
      input.setAttribute("data-title", "Selected: " + file_name);
      //console.log(e.target.result);
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function acceptFile(input) {
  // read the url, grab the filename, display in box
  if (input.files && input.files[0]) {
    getSignedRequest(input.files[0]);
  }
}

function getSignedRequest(file){
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "https://www.cdg2mp4.com/sign_s3?file_name="+file.name+"&file_type="+file.type);
  xhr.onreadystatechange = function(){
    if(xhr.readyState === 4){
      if(xhr.status === 200){
        var response = JSON.parse(xhr.responseText);
        uploadFile(file, response.data, response.url, response.dir_id);
      }
      else{
        alert("Could not get signed URL.");
      }
    }
  };
  xhr.send();
}

function uploadFile(file, s3Data, url, dir_id){
  var xhr = new XMLHttpRequest();
  xhr.open("POST", s3Data.url);

  var postData = new FormData();
  for(var key in s3Data.fields){
    postData.append(key, s3Data.fields[key]);
  }
  postData.append('file', file);

  xhr.onreadystatechange = function() {
    if(xhr.readyState === 4){
      if(xhr.status === 200 || xhr.status === 204){
        console.log("Returning from upload to s3")
        console.log(this.responseText);
        //document.getElementById("preview").src = url;
        //document.getElementById("avatar-url").value = url;
        //redirect to detail/progress
        //window.location.replace("/videos/xxxx");
        start_file_processing(url, dir_id);
      }
      else{
        alert("Could not upload file.");
      }
   }
  };
  xhr.send(postData);
}

function start_file_processing(zip_url, dir_id){
    // Zip URL should point to an external zip (s3, etc)
    console.log("kicking off conversion...", zip_url, dir_id);
    var xhr = new XMLHttpRequest();
    var post_url = "/convert"
    xhr.open("POST", post_url);

    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onreadystatechange = function() {
        if(xhr.readyState === 4){
          if(xhr.status === 200 || xhr.status === 204){
            //document.getElementById("preview").src = url;
            //document.getElementById("avatar-url").value = url;
            //redirect to detail/progress
            //window.location.replace("/videos/xxxx");
             var data = JSON.parse(this.responseText);

             console.log(data);
             // redirect to status page....

             if(data.task_id) {
                 window.location.replace("/video/" + data.dir_id + '/' + data.task_id);
             } else {
                 window.location.replace("/");
             }
          }
          else{
            alert("Error: Could not start conversion.");
          }
        }
    };

    xhr.send(JSON.stringify({
      'zip_url': zip_url,
      'dir_id': dir_id,
    }));
}
