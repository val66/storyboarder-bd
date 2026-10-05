; build/installer.nsh, inclus par electron-builder dans l'installeur NSIS (#447).
;
; LE DÉFAUT : jusqu'à la v1.9.1, le dossier des Projets par défaut était $INSTDIR\Projets, et le
; désinstalleur que chaque mise à jour exécute vide $INSTDIR en entier (RMDir /r). Ce désinstalleur
; est celui de l'ANCIENNE version : nous ne pouvons plus le changer. Le seul moment où l'on peut
; encore sauver ce dossier est ici, dans l'installeur de la NOUVELLE version, AVANT qu'il ne
; désinstalle l'ancienne (customInit s'exécute dans .onInit, la désinstallation vient après, dans
; la section d'installation).
;
; On le déplace vers Documents\<application>\Projets, le nouveau dossier par défaut. Si celui-ci
; existe déjà, vers « Projets (anciens) » à côté, pour ne rien écraser. Le même nom est écrit par
; projects-dir.js (DOSSIER_RECUPERE), qui fait le même déménagement au démarrage de l'application,
; pour les cas que l'installeur n'aurait pas pu traiter.
;
; ASCII seulement dans les chaînes : l'encodage de ce fichier n'a pas à compter.

!macro customInit
  ${If} ${FileExists} "$INSTDIR\Projets\*.*"
    CreateDirectory "$DOCUMENTS\${PRODUCT_NAME}"
    StrCpy $R9 "$DOCUMENTS\${PRODUCT_NAME}\Projets"
    ${If} ${FileExists} "$R9\*.*"
      StrCpy $R9 "$DOCUMENTS\${PRODUCT_NAME}\Projets (anciens)"
    ${EndIf}
    ClearErrors
    Rename "$INSTDIR\Projets" "$R9"
    ${If} ${Errors}
      ; Autre volume ou fichier verrouillé : copie, puis effacement seulement si la copie a réussi.
      ClearErrors
      CreateDirectory "$R9"
      CopyFiles /SILENT "$INSTDIR\Projets\*.*" "$R9"
      ${IfNot} ${Errors}
        RMDir /r "$INSTDIR\Projets"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
