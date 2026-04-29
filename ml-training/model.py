"""CRNN — CNN + BiLSTM + CTC head, GİB CAPTCHA için optimize edilmiş.

Architecture:
    Input: (B, 1, 32, W)              grayscale, height=32 fixed
    Conv1: 64 ch, 3x3, ReLU, MaxPool 2x2     → (B, 64, 16, W/2)
    Conv2: 128 ch, 3x3, ReLU, MaxPool 2x2    → (B, 128, 8, W/4)
    Conv3: 256 ch, 3x3, ReLU                  → (B, 256, 8, W/4)
    Conv4: 256 ch, 3x3, ReLU, MaxPool 2x1    → (B, 256, 4, W/4)
    Conv5: 512 ch, 3x3, ReLU, BN              → (B, 512, 4, W/4)
    Conv6: 512 ch, 3x3, ReLU, BN, MaxPool 2x1 → (B, 512, 2, W/4)
    Conv7: 512 ch, 2x2, ReLU                  → (B, 512, 1, W/4 - 1)
    Map-to-sequence: squeeze H + permute      → (T, B, 512)
    BiLSTM: 2 layers, hidden 256              → (T, B, 512)
    Linear: 512 → num_classes                 → (T, B, num_classes)

CTC loss: log_softmax + ctc_loss(targets, target_lengths, input_lengths)
"""

from __future__ import annotations

import torch
import torch.nn as nn


class CRNN(nn.Module):
    def __init__(self, num_classes: int, in_channels: int = 1, hidden: int = 256):
        super().__init__()
        self.num_classes = num_classes

        self.cnn = nn.Sequential(
            # block 1
            nn.Conv2d(in_channels, 64, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            # block 2
            nn.Conv2d(64, 128, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            # block 3
            nn.Conv2d(128, 256, 3, padding=1),
            nn.ReLU(inplace=True),
            # block 4
            nn.Conv2d(256, 256, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d((2, 1), (2, 1)),
            # block 5
            nn.Conv2d(256, 512, 3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            # block 6
            nn.Conv2d(512, 512, 3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.MaxPool2d((2, 1), (2, 1)),
            # block 7
            nn.Conv2d(512, 512, 2, padding=0),
            nn.ReLU(inplace=True),
        )

        self.lstm = nn.LSTM(
            input_size=512, hidden_size=hidden, num_layers=2, bidirectional=True, dropout=0.2
        )
        self.fc = nn.Linear(hidden * 2, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, 1, 32, W)
        feats = self.cnn(x)  # (B, 512, 1, W')
        b, c, h, w = feats.shape
        if h != 1:
            feats = feats.mean(dim=2, keepdim=True)
        feats = feats.squeeze(2)  # (B, C, W')
        feats = feats.permute(2, 0, 1).contiguous()  # (T=W', B, C)
        rnn_out, _ = self.lstm(feats)  # (T, B, 2H)
        out = self.fc(rnn_out)  # (T, B, num_classes)
        return out


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
