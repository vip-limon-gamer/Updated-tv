let channels = [];
let filteredChannels = [];
let currentIndex = -1;
let hls = null;

let video, videoWrapper, statusDisplay, playBtn, prevBtn, nextBtn, muteBtn, volumeSlider, currentTimeText, totalDurationText, fullscreenBtn, timelineContainer, playBar, bufferedBar;

function initPlayerElements() {
    video = document.getElementById('tv-player');
    videoWrapper = document.getElementById('video-wrapper');
    statusDisplay = document.getElementById('status-display');
    playBtn = document.getElementById('play-btn');
    prevBtn = document.getElementById('prev-btn');
    nextBtn = document.getElementById('next-btn');
    muteBtn = document.getElementById('mute-btn');
    volumeSlider = document.getElementById('volume-slider');
    currentTimeText = document.getElementById('current-time');
    totalDurationText = document.getElementById('total-duration');
    fullscreenBtn = document.getElementById('fullscreen-btn');
    timelineContainer = document.getElementById('timeline-container');
    playBar = document.getElementById('play-bar');
    bufferedBar = document.getElementById('buffered-bar');

    loadLocalM3U('limontv.m3u');
    setupCustomPlayerEngine();
}

async function loadLocalM3U(filename) {
    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`Could not find ${filename} file on server.`);
        const data = await response.text();
        parseM3U(data);
    } catch (err) {
        statusDisplay.innerText = `ERROR: ${err.message}`;
        console.error(err);
    }
}

function parseM3U(data) {
    const lines = data.split('\n');
    channels = [];
    let currentChannel = null;

    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('#EXTINF:')) {
            const nameMatch = line.split(',').pop();
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            currentChannel = {
                name: nameMatch ? nameMatch.trim() : 'Unnamed Stream',
                logo: logoMatch ? logoMatch[1] : 'https://placehold.co/150x75/14141e/00ffff?text=TV',
                url: ''
            };
        } else if (line.startsWith('http') && currentChannel) {
            currentChannel.url = line;
            channels.push(currentChannel);
            currentChannel = null;
        }
    });

    if (channels.length === 0) {
        statusDisplay.innerText = "Empty playlist — no channels found.";
        return;
    }

    statusDisplay.innerText = '';
    filteredChannels = [...channels];
    renderGrid(filteredChannels);
    playChannel(0);
}

function renderGrid(channelList) {
    const grid = document.getElementById('channel-grid');
    if (!grid) return;
    grid.innerHTML = '';

    channelList.forEach((ch) => {
        const globalIndex = channels.findIndex(c => c.url === ch.url);
        const card = document.createElement('div');
        card.className = `channel-card ${globalIndex === currentIndex ? 'active' : ''}`;
        card.onclick = (e) => { e.stopPropagation(); playChannel(globalIndex); };
        card.innerHTML = `
            <img src="${ch.logo}" alt="${ch.name}" onerror="this.src='https://placehold.co/150x75/14141e/00ffff?text=LIVE'">
            <h3>${ch.name}</h3>
        `;
        grid.appendChild(card);
    });
}

function playChannel(globalIndex) {
    if (globalIndex < 0 || globalIndex >= channels.length) return;
    currentIndex = globalIndex;
    const targetUrl = channels[globalIndex].url;

    if (Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls();
        hls.loadSource(targetUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        statusDisplay.innerText = `Network error on "${channels[globalIndex].name}" — trying to recover...`;
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        statusDisplay.innerText = `Media error on "${channels[globalIndex].name}" — attempting recovery...`;
                        hls.recoverMediaError();
                        break;
                    default:
                        statusDisplay.innerText = `Fatal error: cannot play "${channels[globalIndex].name}". Try another channel.`;
                        hls.destroy();
                        break;
                }
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = targetUrl;
        video.load();
        video.play();
    }
    renderGrid(filteredChannels);
}

function setupCustomPlayerEngine() {
    playBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlayPause(); });
    video.addEventListener('click', togglePlayPause);
    video.addEventListener('play', () => { playBtn.innerHTML = '&#9208;'; });
    video.addEventListener('pause', () => { playBtn.innerHTML = '&#9658;'; });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextChannel(); });
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prevChannel(); });
    video.addEventListener('timeupdate', updateTimelineProgress);
    video.addEventListener('progress', updateBufferState);

    timelineContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = timelineContainer.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        if (!isNaN(video.duration) && isFinite(video.duration)) {
            video.currentTime = clickPosition * video.duration;
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        video.volume = e.target.value;
        video.muted = (e.target.value == 0);
        updateMuteButtonVisuals();
    });

    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        updateMuteButtonVisuals();
    });

    fullscreenBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreenMode(); });

    let controlTimeout;
    function showControls() {
        videoWrapper.classList.add('active-controls');
        clearTimeout(controlTimeout);
        controlTimeout = setTimeout(() => { videoWrapper.classList.remove('active-controls'); }, 3000);
    }
    videoWrapper.addEventListener('mousemove', showControls);
    videoWrapper.addEventListener('touchstart', showControls, { passive: true });
    videoWrapper.addEventListener('touchmove', showControls, { passive: true });
}

function togglePlayPause() { if (video.paused) { video.play(); } else { video.pause(); } }
defineProperties = () => {}; 
function nextChannel() { playChannel((currentIndex + 1) % channels.length); }
function prevChannel() { playChannel((currentIndex - 1 + channels.length) % channels.length); }

function formatDisplayTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function updateTimelineProgress() {
    if (video.duration) {
        const percentage = (video.currentTime / video.duration) * 100;
        playBar.style.width = `${percentage}%`;
    }
    currentTimeText.innerText = formatDisplayTime(video.currentTime);
    totalDurationText.innerText = (video.duration && isFinite(video.duration)) ? formatDisplayTime(video.duration) : "LIVE";
}

function updateBufferState() {
    if (video.buffered.length && video.duration) {
        const lastBuffered = video.buffered.end(video.buffered.length - 1);
        const percentage = (lastBuffered / video.duration) * 100;
        bufferedBar.style.width = `${percentage}%`;
    }
}

function updateMuteButtonVisuals() {
    if (video.muted || video.volume === 0) { muteBtn.innerHTML = '&#128263;'; } 
    else if (video.volume < 0.5) { muteBtn.innerHTML = '&#128264;'; } 
    else { muteBtn.innerHTML = '&#128266;'; }
}

function toggleFullscreenMode() {
    if (!document.fullscreenElement) {
        videoWrapper.requestFullscreen().catch(err => console.error(err.message));
    } else {
        document.exitFullscreen();
    }
}

function filterChannels() {
    const query = document.getElementById('search').value.toLowerCase();
    filteredChannels = channels.filter(ch => ch.name.toLowerCase().includes(query));
    renderGrid(filteredChannels);
}

// Kickstart engine assembly once DOM construction finishes
initPlayerElements();

