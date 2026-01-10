!macro customInit
  ; Close running app before installing
  nsExec::Exec 'taskkill /F /IM StudyFlow.exe'
  nsExec::Exec 'taskkill /F /IM backend.exe'
!macroend