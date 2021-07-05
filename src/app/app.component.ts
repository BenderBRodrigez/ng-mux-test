import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import Hls from 'hls.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnDestroy {
  @ViewChild('canvasRef')
  canvasRef!: ElementRef;
  // canvasRef!: ElementRef<HTMLCanvasElement>;

  @ViewChild('videoRef')
  videoRef!: ElementRef<HTMLVideoElement>;

  @ViewChild('videoPlayerRef')
  videoPlayerRef!: ElementRef<HTMLVideoElement>;

  inputStream?: MediaStream;
  mediaRecorder?: MediaRecorder;
  ws?: WebSocket;
  animationId = 0;
  cameraEnabled = false;
  streaming = false;
  connected = false;
  streamKey = '';
  playbackId = '';

  public ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
  }

  async enableCamera(): Promise<void> {
    this.inputStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    this.videoRef.nativeElement.srcObject = this.inputStream;

    await this.videoRef.nativeElement.play();

    // We need to set the canvas height/width to match the video element.
    this.canvasRef.nativeElement.height = this.videoRef.nativeElement.clientHeight;
    this.canvasRef.nativeElement.width = this.videoRef.nativeElement.clientWidth;

    this.animationId = requestAnimationFrame(this.updateCanvas.bind(this));

    this.cameraEnabled = true;
  }

  updateCanvas(): void {
    if (this.videoRef.nativeElement.ended || this.videoRef.nativeElement.paused) {
      return;
    }
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        this.videoRef.nativeElement,
        0,
        0,
        this.videoRef.nativeElement.clientWidth,
        this.videoRef.nativeElement.clientHeight,
      );

      ctx.fillStyle = '#FB3C4E';
      ctx.font = '50px Akkurat';
      ctx.fillText('Live from the browser!', 10, 50, this.canvasRef.nativeElement.width - 20);
    }
    this.animationId = requestAnimationFrame(this.updateCanvas.bind(this));
  }

  stopStreaming(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.streaming = false;
  }

  startStreaming(): void {
    this.streaming = true;

    const wsUrl = `ws://localhost:3000/rtmp?key=${this.streamKey.trim()}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener('open', () => {
      this.connected = true;
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.stopStreaming();
    });

    const videoOutputStream = this.canvasRef.nativeElement.captureStream(30); // 30 FPS

    // Let's do some extra work to get audio to join the party.
    // https://hacks.mozilla.org/2016/04/record-almost-everything-in-the-browser-with-mediarecorder/
    const audioStream = new MediaStream();
    const audioTracks = this.inputStream?.getAudioTracks();
    if (audioTracks) {
      audioTracks.forEach((track) => {
        audioStream.addTrack(track);
      });
    }

    const outputStream = new MediaStream();
    [audioStream, videoOutputStream].forEach((s) => {
      s.getTracks().forEach((t: MediaStreamTrack) => {
        outputStream.addTrack(t);
      });
    });

    this.mediaRecorder = new MediaRecorder(outputStream, {
      mimeType: 'video/webm',
      videoBitsPerSecond: 3000000,
    });

    this.mediaRecorder.addEventListener('dataavailable', (e) => {
      this.ws?.send(e.data);
    });

    this.mediaRecorder.addEventListener('stop', () => {
      this.stopStreaming();
      this.ws?.close();
    });

    this.mediaRecorder.start(1000);
  }

  startVideo(): void {
    const videoUrl = `https://stream.mux.com/${this.playbackId.trim()}.m3u8`;
    if (this.videoPlayerRef.nativeElement.canPlayType('application/vnd.apple.mpegurl')) {
      this.videoPlayerRef.nativeElement.src = videoUrl;
    } else if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(this.videoPlayerRef.nativeElement);
    } else {
      console.error('This is a legacy browser that doesnt support MSE');
    }
  }
}
