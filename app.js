let index = 0;
let data = [];
let factTimer = null;
let songTimer = null;

fetch('songs.json')
  .then(res => res.json())
  .then(json => {
    data = json;
    showSong();
  });

function showSong() {
  const song = data[index];
  const artist = document.getElementById('artist');
  const title  = document.getElementById('title');
  const bg     = document.getElementById('bg');
  const funfact= document.getElementById('funfact');
  const fade   = document.getElementById('fadeOverlay');

  clearInterval(factTimer);
  clearTimeout(songTimer);

  fade.classList.remove('active');

  artist.textContent = song.artist;
  title.textContent  = `${song.title} (${song.year})`;

  bg.style.backgroundImage = `url('${song.image}?v=${Date.now()}')`;
  swapCover(song.image);

  // show first fact immediately
  let factIndex = 0;
  funfact.textContent = song.funfacts[factIndex];
  funfact.classList.add('active');

  // rotate after 5s
  factTimer = setInterval(() => {
    funfact.classList.remove('active');
    setTimeout(() => {
      factIndex = (factIndex + 1) % song.funfacts.length;
      funfact.textContent = song.funfacts[factIndex];
      funfact.classList.add('active');
    }, 700);
  }, 5000);

  // fade to next song after 15s
  songTimer = setTimeout(() => {
    clearInterval(factTimer);
    fade.classList.add('active');
    setTimeout(nextSong, 1000);
  }, 15000);
}


function swapCover(src) {
  const album = document.getElementById('album');
  const fallback = 'assets/COULD NOT FIND COVER.png';

  // Bust cache so Chrome does not reuse an old bitmap
  const withCacheBust = `${src}?v=${Date.now()}`;

  const next = new Image();
  next.onload = () => {
    album.classList.remove('fade-in');   // reset any previous state
    album.classList.add('fade-out');

    setTimeout(() => {
      album.src = withCacheBust;         // swap once the fade-out completes
      album.classList.remove('fade-out');
      album.classList.add('fade-in');

      setTimeout(() => album.classList.remove('fade-in'), 900);
    }, 250);
  };

  next.onerror = () => {
    album.src = fallback;
  };

  next.src = withCacheBust;
}



function nextSong() {
  index = (index + 1) % data.length;
  showSong();
}
