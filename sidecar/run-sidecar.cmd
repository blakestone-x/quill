@echo off
rem Launcher for the Quill local STT sidecar. Run by the "QuillSTT" scheduled
rem task at logon (and auto-restarted on failure). pythonw = no console window.
cd /d "%~dp0"
set QUILL_STT_MODEL=small.en
".venv\Scripts\python.exe" server.py >> sidecar.log 2>&1
