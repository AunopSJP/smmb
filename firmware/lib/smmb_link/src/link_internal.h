#pragma once
// ใช้ภายในไลบรารีเท่านั้น
#include "SmmbLink.h"

extern LinkHooks linkHooks;
extern const char *linkFw;
LinkCredentials linkCred();
void linkBeep(const char *pattern);
