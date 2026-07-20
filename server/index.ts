import { DeskThing } from '@deskthing/server';

const handleGetLyrics = async (data: any) => {
    const payload = data.payload || data;
    const { track_name, artist_name, album_name, duration } = payload;

    try {
        const getParams = new URLSearchParams({
            title: track_name,
            artist: artist_name
        });

        const url = `http://127.0.0.1:5000/api/lyrics/auto-fetch?${getParams.toString()}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            DeskThing.send({ type: 'lyricsData', payload: { error: '가사를 찾을 수 없습니다.' } });
            return;
        }

        const result = await response.json();
        
        if (result && result.lyrics) {
            DeskThing.send({ type: 'lyricsData', payload: { syncedLyrics: result.lyrics } });
        } else {
            DeskThing.send({ type: 'lyricsData', payload: { error: '가사가 제공되지 않는 곡입니다.' } });
        }
    } catch (error: any) {
        DeskThing.send({ type: 'lyricsData', payload: { error: `서버 통신 오류: ${error.message}` } });
    }
};

const start = async (): Promise<void> => {
    console.log('Started the Now Playing app server');
    
    DeskThing.on('get-lyrics', (data: any) => {
        handleGetLyrics(data);
    });
};

const stop = async (): Promise<void> => {
    console.log('Stopped the Now Playing app server');
};

DeskThing.on('start', start);
DeskThing.on('stop', stop);

export { start, stop };