import os
import time
import psycopg2
import logging
import requests
import librosa
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import Optional, List
from pydub import AudioSegment
from pydub.silence import detect_nonsilent

# ----------------------------
# 기본 설정
# ----------------------------
logging.basicConfig(level=logging.DEBUG)

# PostgreSQL 설정
DB_NAME = "test"
DB_USER = "postgres"
DB_PASSWORD = "1234"
DB_HOST = "localhost"
DB_PORT = "5433"

# FastAPI 앱 생성
app = FastAPI()

# 정적 파일 제공
app.mount("/videos", StaticFiles(directory="uploaded_videos"), name="videos")
app.mount("/extracted_audio", StaticFiles(directory="extracted_audio"), name="audio")

# CORS 설정
origins = ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 폴더 생성
AUDIO_FOLDER = "extracted_audio"
os.makedirs(AUDIO_FOLDER, exist_ok=True)
CUSTOM_TTS_FOLDER = os.path.join(AUDIO_FOLDER, "custom_tts")
os.makedirs(CUSTOM_TTS_FOLDER, exist_ok=True)
VOICE_MODEL_FOLDER = "voice_models"
os.makedirs(VOICE_MODEL_FOLDER, exist_ok=True)

# Pydantic 모델
class CustomTTSRequest(BaseModel):
    tts_id: Optional[int] = None
    voice_id: str
    text: str

class VoiceModelRequest(BaseModel):
    name: str
    description: str

# ElevenLabs API 설정 (새로운 API 버전 사용)
ELEVENLABS_API_KEY = "eleven-key"
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"

# PostgreSQL 연결 함수
def get_connection():
    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT
    )

# 루트 라우트
@app.get("/")
def read_root():
    return {"message": "Hello from Service B (TTS Creation)!"}

# ----------------------------
# Spleeter를 이용한 오디오 분리 엔드포인트
# ----------------------------
@app.post("/separate-audio")
async def separate_audio(file: UploadFile = File(...)):
    try:
        # 1. 파일 저장
        original_name = os.path.splitext(file.filename)[0]
        base_name = original_name[:-len("_audio")] if original_name.endswith("_audio") else original_name
        input_path = os.path.join(AUDIO_FOLDER, f"{base_name}.mp3")
        with open(input_path, "wb") as f:
            f.write(await file.read())
        logging.info(f"입력 오디오 저장 완료: {input_path}")

        # 2. Spleeter 실행 (2 stems: vocals + accompaniment)
        from spleeter.separator import Separator
        separator = Separator("spleeter:2stems")
        separator.separate_to_file(input_path, AUDIO_FOLDER)
        logging.info("Spleeter 분리 실행 완료")

        # 3. 분리 결과 폴더에서 vocals와 accompaniment 파일 찾기
        def find_spleeter_vocals(base_folder: str, base_name: str):
            primary_folder = os.path.join(base_folder, base_name)
            if os.path.exists(primary_folder):
                for root, dirs, files in os.walk(primary_folder):
                    if "vocals.wav" in files:
                        return os.path.join(root, "vocals.wav")
            alternate_folder = os.path.join(base_folder, f"{base_name}_audio")
            if os.path.exists(alternate_folder):
                for root, dirs, files in os.walk(alternate_folder):
                    if "vocals.wav" in files:
                        return os.path.join(root, "vocals.wav")
            raise FileNotFoundError(f"❌ '{primary_folder}' 또는 '{alternate_folder}' 내에 vocals.wav를 찾을 수 없습니다!")


        vocals_path, bgm_path = find_spleeter_vocals(AUDIO_FOLDER, base_name)
        logging.info(f"분리된 파일 찾음: vocals={vocals_path}, bgm={bgm_path}")

        # 결과 반환 (URL 경로 변환)
        return JSONResponse(
            content={
                "message": "Spleeter 분리 완료",
                "vocals_path": vocals_path,
                "bgm_path": bgm_path
            },
            status_code=200
        )

    except Exception as e:
        logging.error(f"Spleeter 처리 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Spleeter 처리 실패: {str(e)}")

# ----------------------------
# STT 결과를 받아 TTS 생성 엔드포인트
# ----------------------------
@app.post("/generate-tts-from-stt")
async def generate_tts_from_stt(data: dict):
    try:
        video_id = data.get("video_id")
        if video_id is None:
            raise HTTPException(status_code=400, detail="video_id가 필요합니다.")
        conn = get_connection()
        curs = conn.cursor()
        curs.execute(
            """
            SELECT t.translation_id, t.text, tr.start_time
            FROM translations t
            JOIN transcripts tr ON t.transcript_id = tr.transcript_id
            WHERE tr.video_id = %s;
            """,
            (video_id,)
        )
        translations = curs.fetchall()
        if not translations:
            raise HTTPException(status_code=404, detail="번역된 데이터가 없습니다.")
        tts_output_dir = os.path.join(AUDIO_FOLDER, f"{video_id}_tts")
        os.makedirs(tts_output_dir, exist_ok=True)
        selected_voice_id = "5Af3x6nAIWjF6agOOtOz"
        for translation_id, text, start_time in translations:
            try:
                # 수정된 ElevenLabs TTS 호출
                url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{selected_voice_id}?output_format=mp3_44100_128"
                headers = {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json"
                }
                payload = {"text": text, "model_id": "eleven_multilingual_v2"}
                response = requests.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    raise Exception(f"ElevenLabs TTS 생성 실패: {response.text}")
                audio = response.content

                tts_audio_path = os.path.join(tts_output_dir, f"{translation_id}.mp3")
                with open(tts_audio_path, "wb") as tts_file:
                    tts_file.write(audio)
                duration = librosa.get_duration(path=tts_audio_path)
                curs.execute(
                    "INSERT INTO tts (translation_id, file_path, voice, start_time, duration) VALUES (%s, %s, %s, %s, %s);",
                    (translation_id, tts_audio_path, selected_voice_id, float(start_time), float(duration))
                )
            except Exception as e:
                logging.error(f"TTS 생성 실패: {str(e)}")
        conn.commit()
        curs.close()
        conn.close()
        return JSONResponse(content={"message": "TTS 생성 완료"}, status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS 처리 실패: {str(e)}")

# ----------------------------
# 기존 TTS 생성 (사용자 입력 기반) 엔드포인트
# ----------------------------
@app.post("/generate-tts")
async def generate_tts_custom(request: CustomTTSRequest):
    try:
        conn = get_connection()
        curs = conn.cursor()
        if request.tts_id is not None:
            curs.execute("SELECT translation_id, file_path FROM tts WHERE tts_id = %s;", (request.tts_id,))
            row = curs.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="해당 tts_id를 찾을 수 없습니다.")
            translation_id, tts_audio_path = row
            curs.execute("UPDATE translations SET text = %s WHERE translation_id = %s;", (request.text, translation_id))
            try:
                # 수정된 ElevenLabs TTS 호출 (업데이트)
                url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{request.voice_id}?output_format=mp3_44100_128"
                headers = {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json"
                }
                payload = {"text": request.text, "model_id": "eleven_multilingual_v2"}
                response = requests.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    raise Exception(f"ElevenLabs TTS 생성 실패: {response.text}")
                audio = response.content
                with open(tts_audio_path, "wb") as tts_file:
                    tts_file.write(audio)
                duration = librosa.get_duration(path=tts_audio_path)
                curs.execute(
                    "UPDATE tts SET voice = %s, duration = %s WHERE tts_id = %s;",
                    (request.voice_id, duration, request.tts_id)
                )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"ElevenLabs TTS 생성 실패: {str(e)}")
        else:
            timestamp = int(time.time())
            tts_audio_path = os.path.join(CUSTOM_TTS_FOLDER, f"tts_{timestamp}.mp3")
            try:
                # 수정된 ElevenLabs TTS 호출 (신규 생성)
                url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{request.voice_id}?output_format=mp3_44100_128"
                headers = {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json"
                }
                payload = {"text": request.text, "model_id": "eleven_multilingual_v2"}
                response = requests.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    raise Exception(f"ElevenLabs TTS 생성 실패: {response.text}")
                audio = response.content
                with open(tts_audio_path, "wb") as tts_file:
                    tts_file.write(audio)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"ElevenLabs TTS 생성 실패: {str(e)}")
            curs.execute("INSERT INTO translations (text, language) VALUES (%s, %s) RETURNING translation_id;", (request.text, "en"))
            translation_id = curs.fetchone()[0]
            duration = librosa.get_duration(path=tts_audio_path)
            curs.execute(
                "INSERT INTO tts (translation_id, file_path, voice, start_time, duration) VALUES (%s, %s, %s, %s, %s) RETURNING tts_id;",
                (translation_id, tts_audio_path, request.voice_id, 0.0, duration)
            )
            request.tts_id = curs.fetchone()[0]
        conn.commit()
        curs.close()
        conn.close()
        tts_file_url = tts_audio_path.replace(AUDIO_FOLDER, "/extracted_audio")
        return JSONResponse(content={"message": "TTS 생성 완료", "file_url": tts_file_url, "tts_id": request.tts_id}, status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS 처리 실패: {str(e)}")

def split_audio(input_path: str, output_dir: str, max_size_mb: int = 10):
    os.makedirs(output_dir, exist_ok=True)
    try:
        audio = AudioSegment.from_file(input_path)
        threshold = audio.dBFS - 16
        nonsilent_ranges = detect_nonsilent(audio, min_silence_len=500, silence_thresh=threshold, seek_step=1)
        parts = []
        for idx, (start, end) in enumerate(nonsilent_ranges):
            if end - start < 1000:
                continue
            segment = audio[start:end]
            part_path = os.path.join(output_dir, f"part_{idx}.mp3")
            segment.export(part_path, format="mp3", bitrate="192k")
            parts.append(part_path)
        logging.info(f"🔹 분할된 파일 개수: {len(parts)}")
        max_samples = 25
        if len(parts) > max_samples:
            indices = [int(i * (len(parts) - 1) / (max_samples - 1)) for i in range(max_samples)]
            parts = [parts[i] for i in indices]
            logging.info(f"🔹 샘플 수가 많아 균일하게 {max_samples}개로 축소함")
        return parts
    except Exception as e:
        logging.error(f"❌ 오디오 분할 실패: {str(e)}")
        return []

def merge_nonsilent_audio_improved(input_path: str, output_dir: str, min_silence_len: int = 500, silence_thresh: float = None, output_filename: str = "merged_sample.mp3", fade_duration: int = 200):
    os.makedirs(output_dir, exist_ok=True)
    try:
        audio = AudioSegment.from_file(input_path)
        if silence_thresh is None:
            silence_thresh = audio.dBFS - 16
        nonsilent_ranges = detect_nonsilent(audio, min_silence_len=min_silence_len, silence_thresh=silence_thresh, seek_step=1)
        merged_audio = AudioSegment.empty()
        for start, end in nonsilent_ranges:
            if end - start < 1000:
                continue
            segment = audio[start:end]
            segment = segment.fade_in(fade_duration).fade_out(fade_duration)
            merged_audio += segment
        output_path = os.path.join(output_dir, output_filename)
        merged_audio.export(output_path, format="mp3", bitrate="192k")
        logging.info(f"🔹 병합된 파일 생성: {output_path}")
        return output_path
    except Exception as e:
        logging.error(f"❌ 병합 실패: {str(e)}")
        return None

def split_merged_audio(merged_path: str, output_dir: str, max_duration_sec: int = 30, max_samples: int = 25):
    os.makedirs(output_dir, exist_ok=True)
    try:
        audio = AudioSegment.from_file(merged_path)
        duration_ms = len(audio)
        max_duration_ms = max_duration_sec * 1000
        parts = []
        if (duration_ms <= max_duration_ms):
            parts.append(merged_path)
        else:
            num_parts = (duration_ms + max_duration_ms - 1) // max_duration_ms
            for i in range(num_parts):
                start = i * max_duration_ms
                end = min((i + 1) * max_duration_ms, duration_ms)
                segment = audio[start:end]
                part_path = os.path.join(output_dir, f"merged_part_{i}.mp3")
                segment.export(part_path, format="mp3", bitrate="192k")
                parts.append(part_path)
        if len(parts) > max_samples:
            indices = [int(i * (len(parts) - 1) / (max_samples - 1)) for i in range(max_samples)]
            parts = [parts[i] for i in indices]
            logging.info(f"🔹 병합 샘플 수가 많아 균일하게 {max_samples}개로 축소함")
        return parts
    except Exception as e:
        logging.error(f"❌ 병합 후 분할 실패: {str(e)}")
        return []


@app.post("/create-voice-model")
async def create_voice_model(
    name: str = Form(...),
    description: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """
    업로드된 여러 오디오 파일을 받아서,
    각 파일에 대해 Spleeter로 보컬(음성)만 분리하고,
    분리된 보컬 음원을 기반으로 무음 구간을 제거한 후 병합 및 분할하여
    최대 25개의 샘플 파일을 생성합니다.
    이 샘플 파일들을 ElevenLabs API에 전달하여 보이스 모델(클론)을 생성하고,
    생성된 모델 정보를 DB에 저장합니다.
    작업 완료 후 임시 파일들을 삭제합니다.
    
    **파일 크기는 10MB 이하만 허용됩니다.**
    """
    all_sample_parts = []

    # 10MB 제한 (바이트 단위)
    MAX_FILE_SIZE = 10 * 1024 * 1024

    for file in files:
        # 파일 크기 체크
        file.file.seek(0, os.SEEK_END)
        size = file.file.tell()
        file.file.seek(0)
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"파일 {file.filename}의 크기가 10MB를 초과합니다.")

        original_name = os.path.splitext(file.filename)[0]
        base_name = original_name[:-len("_audio")] if original_name.endswith("_audio") else original_name
        
        original_path = os.path.join(AUDIO_FOLDER, f"{base_name}_{int(time.time())}.mp3")
        logging.info(f"📥 파일 저장 시작: {file.filename}")
        with open(original_path, "wb") as f:
            f.write(await file.read())
        
        try:
            from spleeter.separator import Separator
            separator = Separator("spleeter:2stems")
            separator.separate_to_file(original_path, AUDIO_FOLDER)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Spleeter 실행 실패: {str(e)}")
        
        def find_spleeter_vocals(base_folder: str, base_name: str):
            primary_folder = os.path.join(base_folder, base_name)
            if os.path.exists(primary_folder):
                for root, dirs, files in os.walk(primary_folder):
                    if "vocals.wav" in files:
                        return os.path.join(root, "vocals.wav")
            alternate_folder = os.path.join(base_folder, f"{base_name}_audio")
            if os.path.exists(alternate_folder):
                for root, dirs, files in os.walk(alternate_folder):
                    if "vocals.wav" in files:
                        return os.path.join(root, "vocals.wav")
            raise FileNotFoundError(f"❌ '{base_folder}' 내에 vocals.wav를 찾을 수 없습니다!")
        
        vocal_path = find_spleeter_vocals(AUDIO_FOLDER, base_name)
        fixed_vocal_path = os.path.join(AUDIO_FOLDER, f"{base_name}_vocals_{int(time.time())}.wav")
        shutil.move(vocal_path, fixed_vocal_path)
        # Spleeter가 생성한 원본 폴더 삭제
        folder_primary = os.path.join(AUDIO_FOLDER, base_name)
        if os.path.exists(folder_primary):
            shutil.rmtree(folder_primary, ignore_errors=True)
        folder_alternate = os.path.join(AUDIO_FOLDER, f"{base_name}_audio")
        if os.path.exists(folder_alternate):
            shutil.rmtree(folder_alternate, ignore_errors=True)
        
        merge_dir = os.path.join(AUDIO_FOLDER, f"{base_name}_merged")
        os.makedirs(merge_dir, exist_ok=True)
        merged_sample_path = merge_nonsilent_audio_improved(fixed_vocal_path, merge_dir, output_filename="merged_sample.mp3", fade_duration=200)
        if not merged_sample_path:
            raise HTTPException(status_code=500, detail="병합 파일 생성 실패")
        
        split_dir = os.path.join(AUDIO_FOLDER, f"{base_name}_split")
        os.makedirs(split_dir, exist_ok=True)
        MAX_MERGED_DURATION_SEC = 30
        sample_parts = split_merged_audio(merged_sample_path, split_dir, max_duration_sec=MAX_MERGED_DURATION_SEC, max_samples=25)
        if not sample_parts:
            raise HTTPException(status_code=500, detail="병합 후 분할 실패")
        
        # 모든 파일의 sample_parts를 누적
        all_sample_parts.extend(sample_parts)
        
        # 임시 파일 정리 (개별 파일 처리 후)
        try:
            if os.path.exists(original_path):
                os.remove(original_path)
            if os.path.exists(fixed_vocal_path):
                os.remove(fixed_vocal_path)
            if os.path.exists(merge_dir):
                shutil.rmtree(merge_dir, ignore_errors=True)
            if os.path.exists(split_dir):
                shutil.rmtree(split_dir, ignore_errors=True)
        except Exception as cleanup_error:
            logging.warning(f"임시 파일 정리 실패: {cleanup_error}")

    if not all_sample_parts:
        raise HTTPException(status_code=500, detail="샘플 파일 생성 실패")

    # ElevenLabs API 호출
    voice_response = create_voice_model_api(name=name, description=description, sample_file_paths=all_sample_parts)
    voice_id = voice_response.get("voice_id")
    if not voice_id:
        raise Exception("보이스 모델 생성 실패: voice_id가 반환되지 않음")
    logging.info(f"✅ 보이스 모델 생성 완료: {voice_id}")
    
    conn = get_connection()
    curs = conn.cursor()
    curs.execute(
        "INSERT INTO voice_models (voice_id, name, description) VALUES (%s, %s, %s) RETURNING id;",
        (voice_id, name, description)
    )
    inserted_id = curs.fetchone()[0]
    conn.commit()
    curs.close()
    conn.close()
    logging.info(f"📌 DB에 voice_models 테이블에 저장 완료 (id: {inserted_id})")

    return JSONResponse(
        content={
            "message": "보이스 모델 생성 완료",
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "db_id": inserted_id,
        },
        status_code=200
    )
