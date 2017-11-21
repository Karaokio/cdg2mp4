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
  xhr.open("GET", "/sign_s3?file_name="+file.name+"&file_type="+file.type);
  xhr.onreadystatechange = function(){
    if(xhr.readyState === 4){
      if(xhr.status === 200){
        var response = JSON.parse(xhr.responseText);
        uploadFile(file, response.data, response.url);
      }
      else{
        alert("Could not get signed URL.");
      }
    }
  };
  xhr.send();
}

function uploadFile(file, s3Data, url){
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
        //document.getElementById("preview").src = url;
        //document.getElementById("avatar-url").value = url;
        //redirect to detail/progress
      }
      else{
        alert("Could not upload file.");
      }
   }
  };
  xhr.send(postData);
}
