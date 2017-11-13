'use strict';

var options = {
  classname: 'progbar',
  id: 'progress-bar',
  target: document.getElementById('progress-bar')
};

var nanobar = new Nanobar(options);

// move bar
nanobar.go(30); // size bar 30%
