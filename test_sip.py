import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect(('127.0.0.1', 5060))
    s.send(b'OPTIONS sip:voicetrace@127.0.0.1 SIP/2.0\r\nVia: SIP/2.0/TCP 127.0.0.1:5060;branch=z9hG4bK123\r\nFrom: <sip:test@test.com>;tag=123\r\nTo: <sip:voicetrace@127.0.0.1>\r\nCall-ID: 12345\r\nCSeq: 1 OPTIONS\r\nContact: <sip:test@127.0.0.1>\r\nMax-Forwards: 70\r\nContent-Length: 0\r\n\r\n')
    print(s.recv(1024).decode('utf-8'))
except Exception as e:
    print(f'Error: {e}')
