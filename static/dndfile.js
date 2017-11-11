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
