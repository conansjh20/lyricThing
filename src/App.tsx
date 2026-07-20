import React, { useEffect, useState, useRef } from 'react'
import { DeskThing } from '@deskthing/client'
import { SongData } from '@deskthing/types'

type LyricLine = {
    time: number;
    original: string;
    pronunciation?: string;
    translation?: string;
}

type ApiLyric = {
    timestamp?: string;
    original: string;
    pronunciation?: string;
    translation?: string;
}

const parseSyncedLyrics = (lyrics: ApiLyric[]): LyricLine[] => {
    return lyrics.map(line => {
        let timeInMs = -1;
        
        if (line.timestamp) {
            const regex = /\[(\d{2,}):(\d{2})\.(\d{2,3})\]/;
            const match = line.timestamp.match(regex);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const fraction = match[3];
                let ms = 0;
                if (fraction.length === 2) {
                    ms = parseInt(fraction, 10) * 10;
                } else {
                    ms = parseInt(fraction, 10);
                }
                timeInMs = (minutes * 60 + seconds) * 1000 + ms;
            }
        }
        
        return {
            time: timeInMs,
            original: line.original || '♪',
            pronunciation: line.pronunciation,
            translation: line.translation
        };
    }).filter(line => line.time !== -1);
};

const formatTime = (ms: number) => {
    if (!ms || ms < 0) return '0:00'
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const App: React.FC = () => {
    const [song, setSong] = useState<SongData | null>(null)
    const [progressMs, setProgressMs] = useState<number>(0)
    const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[] | null>(null)
    const [loadingLyrics, setLoadingLyrics] = useState<boolean>(false)
    const [lyricsError, setLyricsError] = useState<string | null>(null)

    const lyricsContainerRef = useRef<HTMLDivElement>(null)
    const activeLineRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const removeMusicListener = DeskThing.on('music', (data: any) => {
            if (data.payload) {
                const songData = data.payload as SongData;
                setSong(prev => {
                    // 곡이 바뀌면 가사 초기화
                    if (prev && (prev.track_name !== songData.track_name || prev.artist !== songData.artist)) {
                        setSyncedLyrics(null)
                        setLyricsError(null)
                    }
                    return songData;
                });
                if (songData.track_progress != null) {
                    setProgressMs(songData.track_progress);
                }
            }
        })

        const removeLyricsListener = DeskThing.on('lyricsData', (data: any) => {
            setLoadingLyrics(false)
            if (data.payload) {
                if (data.payload.syncedLyrics) {
                    setSyncedLyrics(parseSyncedLyrics(data.payload.syncedLyrics))
                    setLyricsError(null)
                } else if (data.payload.error) {
                    setSyncedLyrics(null)
                    setLyricsError(data.payload.error)
                }
            }
        })

        DeskThing.send({ app: 'music', type: 'get', request: 'song' })

        return () => {
            removeMusicListener()
            removeLyricsListener()
        }
    }, [])

    useEffect(() => {
        if (!song || !song.is_playing) return;
        
        const interval = setInterval(() => {
            setProgressMs(prev => {
                const newProgress = prev + 250;
                return song.track_duration && newProgress > song.track_duration 
                    ? song.track_duration 
                    : newProgress;
            });
        }, 250);

        return () => clearInterval(interval);
    }, [song?.is_playing, song?.track_duration]);

    // 실제 레이턴시 보정을 위해 노래 진행률(progressMs)에 1000ms를 더해 가사를 1초 먼저 띄웁니다.
    const LYRIC_OFFSET_MS = 1000;
    const adjustedProgressMs = progressMs + LYRIC_OFFSET_MS;

    const activeIndex = syncedLyrics ? syncedLyrics.findIndex((line, i) => {
        const nextLine = syncedLyrics[i + 1];
        if (!nextLine) return adjustedProgressMs >= line.time;
        return adjustedProgressMs >= line.time && adjustedProgressMs < nextLine.time;
    }) : -1;

    useEffect(() => {
        if (activeLineRef.current && lyricsContainerRef.current) {
            const container = lyricsContainerRef.current;
            const activeLine = activeLineRef.current;
            
            const containerCenter = container.clientHeight / 2;
            const scrollPos = activeLine.offsetTop - containerCenter + activeLine.clientHeight / 2;
            
            container.scrollTo({
                top: scrollPos,
                behavior: 'smooth'
            });
        }
    }, [activeIndex])

    const requestLyrics = () => {
        if (!song) return;
        setLoadingLyrics(true);
        setSyncedLyrics(null);
        setLyricsError(null);
        
        const durationS = song.track_duration ? Math.round(song.track_duration / 1000) : 0;
        
        DeskThing.send({
            type: 'get-lyrics',
            payload: {
                track_name: song.track_name,
                artist_name: song.artist,
                album_name: song.album || '',
                duration: durationS
            }
        });
    }

    const previousSongRef = useRef<string | null>(null);

    // 노래가 변경되었을 때 자동으로 가사 요청
    useEffect(() => {
        if (!song || !song.track_name || !song.artist) return;
        
        const songKey = `${song.track_name}-${song.artist}`;
        if (previousSongRef.current !== songKey) {
            previousSongRef.current = songKey;
            requestLyrics();
        }
    }, [song?.track_name, song?.artist]);

    const progressPercent = song?.track_duration 
        ? Math.min(100, Math.max(0, (progressMs / song.track_duration) * 100))
        : 0;

    return (
        <div className="bg-slate-900 w-screen h-screen flex flex-col text-white overflow-hidden">
            
            {/* 상단: Now Playing 바 (약 50px 높이) */}
            <div className="flex-none h-16 w-full bg-slate-800 flex items-center px-4 gap-4 border-b border-slate-700 shadow-md z-20">
                {song ? (
                    <>
                        {/* 자켓 사진 */}
                        {song.thumbnail ? (
                            <img 
                                src={song.thumbnail} 
                                alt="Album Art" 
                                className="w-10 h-10 rounded-md object-cover shadow-sm flex-shrink-0"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <span className="text-slate-500 text-xs">No img</span>
                            </div>
                        )}
                        
                        {/* 곡 정보 */}
                        <div className="flex flex-col min-w-[120px] max-w-[200px] flex-shrink-0">
                            <span className="text-sm font-bold text-white truncate leading-tight">{song.track_name}</span>
                            <span className="text-xs text-gray-400 truncate">{song.artist || 'Unknown Artist'}</span>
                        </div>

                        {/* 재생 바 */}
                        <div className="flex-1 flex items-center gap-3 px-2 min-w-0">
                            <span className="text-xs text-gray-400 font-medium w-10 text-right">{formatTime(progressMs)}</span>
                            <div className="flex-1 bg-slate-700 h-1.5 rounded-full overflow-hidden relative">
                                <div 
                                    className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-300 ease-linear rounded-full"
                                    style={{ width: `${progressPercent}%` }}
                                ></div>
                            </div>
                            <span className="text-xs text-gray-400 font-medium w-10">{formatTime(song.track_duration || 0)}</span>
                        </div>

                        {/* 가사 버튼 */}
                        <button 
                            onClick={requestLyrics}
                            disabled={loadingLyrics}
                            className="flex-shrink-0 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                        >
                            {loadingLyrics ? '불러오는 중...' : '동기화 가사'}
                        </button>
                    </>
                ) : (
                    <div className="w-full flex items-center justify-center text-gray-400 text-sm h-full">
                        🎵 음악 정보가 없습니다. 노래를 재생해주세요.
                    </div>
                )}
            </div>

            {/* 하단: 가사 표시 영역 (전체 차지) */}
            <div className="flex-1 w-full bg-slate-900 relative overflow-hidden flex flex-col items-center justify-center">
                {/* 상하단 페이드 효과를 위한 그라데이션 */}
                <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-slate-900 to-transparent z-10 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-slate-900 to-transparent z-10 pointer-events-none"></div>
                
                {syncedLyrics ? (
                    <div 
                        ref={lyricsContainerRef}
                        className="w-full h-full overflow-y-auto px-8 whitespace-pre-wrap text-center leading-relaxed font-medium pt-[25vh] pb-[35vh]"
                    >
                        {syncedLyrics.map((line, idx) => {
                            const isActive = idx === activeIndex;
                            const isPast = idx < activeIndex;
                            
                            return (
                                <div 
                                    key={idx}
                                    ref={isActive ? activeLineRef : null}
                                    className={`py-4 transition-all duration-300 ease-in-out cursor-default flex flex-col gap-2
                                        ${isActive ? 'scale-105 opacity-100 drop-shadow-xl my-4' : 
                                          isPast ? 'opacity-50' : 
                                          'opacity-70'}`}
                                >
                                    <div className={`${isActive ? 'text-4xl text-green-400 font-extrabold' : isPast ? 'text-2xl text-gray-500' : 'text-2xl text-gray-400'}`}>
                                        {line.original}
                                    </div>
                                    {line.pronunciation && (
                                        <div className={`${isActive ? 'text-2xl text-green-200 font-bold' : 'text-lg text-gray-400'} opacity-90`}>
                                            {line.pronunciation}
                                        </div>
                                    )}
                                    {line.translation && (
                                        <div className={`${isActive ? 'text-xl text-green-300 font-semibold' : 'text-base text-gray-500'} opacity-80 mt-1`}>
                                            {line.translation}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="text-center">
                        {loadingLyrics ? (
                            <div className="text-green-400 animate-pulse text-2xl font-bold">가사를 검색하고 있습니다...</div>
                        ) : lyricsError ? (
                            <div className="text-red-400 text-2xl font-bold">{lyricsError}</div>
                        ) : (
                            <div className="text-gray-500 text-xl font-medium">상단의 '동기화 가사' 버튼을 눌러주세요</div>
                        )}
                    </div>
                )}
                
                {/* 커스텀 스크롤바 감추기 */}
                <style>{`
                    div::-webkit-scrollbar {
                        display: none;
                    }
                `}</style>
            </div>
        </div>
    )
}

export default App
